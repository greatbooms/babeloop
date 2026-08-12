import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { AiExecutionLogService } from '../modules/ai-log/ai-execution-log.service';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { AiExecutionMeta } from '../modules/ai-log/ai-execution-log.service';
import { downloadExternal } from '../common/security/external-url.guard';
import {
  OCR_PROVIDER,
  OcrProvider,
  VISUAL_DESCRIPTION_PROMPT_VERSION,
  VisualDescriptionOutput,
} from '../providers/ocr/ocr.provider';
import { STT_PROVIDER, SttProvider } from '../providers/stt/stt.provider';
import { JOB_TYPES, MEDIA_PROCESSING_QUEUE } from './queue.constants';
import { extractVideoThumbnail, hasAudioStream } from '../common/media/video-thumbnail';

@Processor(MEDIA_PROCESSING_QUEUE)
export class MediaProcessingProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly aiLog: AiExecutionLogService,
    private readonly jobRecord: JobRecordService,
    @Inject(OCR_PROVIDER) private readonly ocr: OcrProvider,
    @Inject(STT_PROVIDER) private readonly stt: SttProvider,
  ) {
    super();
  }

  async process(job: BullJob): Promise<void> {
    if (job.name === JOB_TYPES.DOWNLOAD_EXTERNAL_MEDIA) return this.downloadExternalMedia(job);
    if (job.name === JOB_TYPES.GENERATE_THUMBNAIL) return this.generateThumbnail(job);
    return this.processMedia(job);
  }

  private async createAndStoreThumbnail(asset: { id: string; storageKey: string }): Promise<string> {
    const buffer = await this.storage.getBuffer(asset.storageKey);
    const thumbnail = await extractVideoThumbnail(buffer);
    const thumbnailKey = `${asset.storageKey}.thumb.jpg`;
    await this.storage.putBuffer(thumbnailKey, thumbnail, 'image/jpeg');
    await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { thumbnailKey } });
    return thumbnailKey;
  }

  private async generateThumbnail(job: BullJob<{ mediaAssetId: string }>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const asset = await this.prisma.mediaAsset.findUniqueOrThrow({ where: { id: job.data.mediaAssetId } });
      if (asset.kind !== 'VIDEO') throw new Error('영상 자산만 썸네일을 생성할 수 있습니다');
      if (!asset.thumbnailKey) await this.createAndStoreThumbnail(asset);
      await this.jobRecord.markSucceeded(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) await this.jobRecord.markFailed(jobId, message);
      throw error;
    }
  }

  private async describeVisual(
    buffer: Buffer,
    contentType: string,
    inputRef: string,
  ): Promise<VisualDescriptionOutput> {
    const meta: AiExecutionMeta = {
      provider: this.ocr.name,
      model: this.ocr.model,
      promptVersion: VISUAL_DESCRIPTION_PROMPT_VERSION,
      inputRef,
    };
    return this.aiLog.record(meta, async () => {
      const result = await this.ocr.describe({ buffer, contentType });
      Object.assign(meta, {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costEstimateUsd: result.costEstimateUsd,
      });
      return result;
    });
  }

  private async processMedia(job: BullJob<{ mediaAssetId: string }>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    const asset = await this.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: job.data.mediaAssetId },
    });
    try {
      await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: 'PROCESSING' } });
      const buffer = await this.storage.getBuffer(asset.storageKey);
      const inputRef = `mediaAsset:${asset.id}`;

      if (asset.kind === 'IMAGE') {
        const meta: AiExecutionMeta = { provider: this.ocr.name, model: this.ocr.model, inputRef };
        const out = await this.aiLog.record(
          meta,
          async () => {
            const result = await this.ocr.extractText({ buffer, contentType: asset.contentType, filename: asset.originalFilename });
            Object.assign(meta, {
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              costEstimateUsd: result.costEstimateUsd,
            });
            return result;
          },
        );
        const visual = await this.describeVisual(buffer, asset.contentType, inputRef);
        // 재추출은 교체다 — 파생 데이터를 쌓으면 화면에 같은 내용이 중복된다 (호출 이력은 AI 실행 로그가 보관)
        await this.prisma.$transaction([
          this.prisma.ocrResult.deleteMany({ where: { mediaAssetId: asset.id } }),
          this.prisma.ocrResult.create({
            data: { mediaAssetId: asset.id, text: out.text, provider: this.ocr.name, model: this.ocr.model },
          }),
          this.prisma.visualDescription.deleteMany({ where: { mediaAssetId: asset.id } }),
          this.prisma.visualDescription.create({
            data: {
              mediaAssetId: asset.id,
              text: visual.text,
              provider: this.ocr.name,
              model: this.ocr.model,
              promptVersion: VISUAL_DESCRIPTION_PROMPT_VERSION,
            },
          }),
        ]);
      } else {
        // 무음 영상(오디오 트랙 없음)은 Whisper가 400으로 거절한다 — 전사를 건너뛰고 비주얼 묘사로 분석 재료를 만든다
        const audible = await hasAudioStream(buffer).catch(() => true);
        const out = audible
          ? await this.aiLog.record(
              { provider: this.stt.name, model: this.stt.model, inputRef },
              () => this.stt.transcribe({ buffer, contentType: asset.contentType, filename: asset.originalFilename }),
            )
          : null;
        let thumbnailKey = asset.thumbnailKey;
        if (!thumbnailKey) {
          try {
            thumbnailKey = await this.createAndStoreThumbnail(asset);
          } catch {
            // 썸네일은 부가물이다. 생성할 수 없으면 전사만 교체하고 기존 비주얼 묘사는 제거한다.
          }
        }
        const visual = thumbnailKey
          ? await this.describeVisual(await this.storage.getBuffer(thumbnailKey), 'image/jpeg', inputRef)
          : null;
        await this.prisma.$transaction([
          this.prisma.transcription.deleteMany({ where: { mediaAssetId: asset.id } }),
          ...(out
            ? [this.prisma.transcription.create({
                data: { mediaAssetId: asset.id, text: out.text, language: out.language, provider: this.stt.name, model: this.stt.model },
              })]
            : []),
          this.prisma.visualDescription.deleteMany({ where: { mediaAssetId: asset.id } }),
          ...(visual
            ? [this.prisma.visualDescription.create({
                data: {
                  mediaAssetId: asset.id,
                  text: visual.text,
                  provider: this.ocr.name,
                  model: this.ocr.model,
                  promptVersion: VISUAL_DESCRIPTION_PROMPT_VERSION,
                },
              })]
            : []),
        ]);
      }

      await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: 'READY' } });
      await this.jobRecord.markSucceeded(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: 'FAILED' } });
        await this.jobRecord.markFailed(jobId, message);
      }
      throw error; // BullMQ 재시도를 위해 다시 던진다
    }
  }

  private async downloadExternalMedia(
    job: BullJob<{ sourceAdId: string; url: string; type: string }>,
  ): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      // CSV의 Creative URL은 사용자 입력 — SSRF 관문을 통해서만 다운로드한다
      const { buffer, contentType } = await downloadExternal(job.data.url);
      const kind = job.data.type === 'video' || contentType.startsWith('video/') ? 'VIDEO' : 'IMAGE';
      const storageKey = `source-ads/${job.data.sourceAdId}/original`;
      await this.storage.putBuffer(storageKey, buffer, contentType);

      let asset = await this.prisma.mediaAsset.findFirst({ where: { storageKey } });
      if (!asset) {
        asset = await this.prisma.mediaAsset.create({
          data: {
            kind,
            origin: 'AD_IMPORT',
            status: 'UPLOADED',
            originalFilename: `external-${job.data.sourceAdId}`,
            contentType,
            sizeBytes: buffer.length,
            storageKey,
          },
        });
      }
      if (kind === 'VIDEO' && !asset.thumbnailKey) {
        try {
          await this.createAndStoreThumbnail(asset);
        } catch {
          // 외부 미디어 다운로드는 썸네일 생성 실패와 무관하게 성공 처리한다.
        }
      }
      await this.prisma.sourceAd.update({
        where: { id: job.data.sourceAdId },
        data: { mediaAssetId: asset.id },
      });
      await this.jobRecord.markSucceeded(jobId, { mediaAssetId: asset.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) await this.jobRecord.markFailed(jobId, message);
      throw error;
    }
  }
}

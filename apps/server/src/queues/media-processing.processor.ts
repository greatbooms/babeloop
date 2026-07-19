import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { AiExecutionLogService } from '../modules/ai-log/ai-execution-log.service';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { AiExecutionMeta } from '../modules/ai-log/ai-execution-log.service';
import { downloadExternal } from '../common/security/external-url.guard';
import { OCR_PROVIDER, OcrProvider } from '../providers/ocr/ocr.provider';
import { STT_PROVIDER, SttProvider } from '../providers/stt/stt.provider';
import { JOB_TYPES, MEDIA_PROCESSING_QUEUE } from './queue.constants';

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
    return this.processMedia(job);
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
        await this.prisma.ocrResult.create({
          data: { mediaAssetId: asset.id, text: out.text, provider: this.ocr.name, model: this.ocr.model },
        });
      } else {
        const out = await this.aiLog.record(
          { provider: this.stt.name, model: this.stt.model, inputRef },
          () => this.stt.transcribe({ buffer, contentType: asset.contentType, filename: asset.originalFilename }),
        );
        await this.prisma.transcription.create({
          data: { mediaAssetId: asset.id, text: out.text, language: out.language, provider: this.stt.name, model: this.stt.model },
        });
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
            status: 'UPLOADED',
            originalFilename: `external-${job.data.sourceAdId}`,
            contentType,
            sizeBytes: buffer.length,
            storageKey,
          },
        });
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

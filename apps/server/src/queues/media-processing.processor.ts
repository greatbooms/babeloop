import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { AiExecutionLogService } from '../modules/ai-log/ai-execution-log.service';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { OCR_PROVIDER, OcrProvider } from '../providers/ocr/ocr.provider';
import { STT_PROVIDER, SttProvider } from '../providers/stt/stt.provider';
import { MEDIA_PROCESSING_QUEUE } from './queue.constants';

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

  async process(job: BullJob<{ mediaAssetId: string }>): Promise<void> {
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
        const out = await this.aiLog.record(
          { provider: this.ocr.name, model: this.ocr.model, inputRef },
          () => this.ocr.extractText({ buffer, contentType: asset.contentType, filename: asset.originalFilename }),
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
}

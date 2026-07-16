import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiExecutionLogService } from '../modules/ai-log/ai-execution-log.service';
import { VectorSearchRepository } from '../modules/creative-analysis/vector-search.repository';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../providers/embedding/embedding.provider';
import { EMBEDDING_QUEUE } from './queue.constants';

@Processor(EMBEDDING_QUEUE)
export class EmbeddingProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiLog: AiExecutionLogService,
    private readonly vectors: VectorSearchRepository,
    private readonly jobRecord: JobRecordService,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
  ) {
    super();
  }

  async process(job: BullJob<{ sourceAdId: string; inputText: string }>): Promise<void> {
    const jobId = job.id!;
    const { sourceAdId, inputText } = job.data;
    await this.jobRecord.markRunning(jobId);
    try {
      const vector = await this.aiLog.record(
        { provider: this.embedder.name, model: this.embedder.model, inputRef: `sourceAd:${sourceAdId}` },
        () => this.embedder.embed(inputText),
      );
      await this.vectors.upsertEmbedding({
        sourceAdId,
        model: this.embedder.model,
        dimension: this.embedder.dimension,
        vector,
      });
      await this.prisma.sourceAd.update({ where: { id: sourceAdId }, data: { status: 'ANALYZED' } });
      await this.jobRecord.markSucceeded(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.prisma.sourceAd.update({ where: { id: sourceAdId }, data: { status: 'FAILED' } });
        await this.jobRecord.markFailed(jobId, message);
      }
      throw error;
    }
  }
}

import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob, Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiExecutionLogService } from '../modules/ai-log/ai-execution-log.service';
import { AnalysisService } from '../modules/creative-analysis/analysis.service';
import { creativeAnalysisSchema, PROMPT_VERSION } from '../modules/creative-analysis/creative-analysis.schema';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { generateJsonWithRepair } from '../providers/text/generate-json-with-repair';
import { TEXT_GENERATION_PROVIDER, TextGenerationProvider } from '../providers/text/text-generation.provider';
import {
  CREATIVE_ANALYSIS_QUEUE,
  EMBEDDING_QUEUE,
  generateEmbeddingJobId,
  JOB_TYPES,
} from './queue.constants';

const SYSTEM_PROMPT =
  '너는 광고 크리에이티브 분석가다. 주어진 광고 텍스트를 분석해 지정된 JSON 스키마로만 응답한다.';

@Processor(CREATIVE_ANALYSIS_QUEUE)
export class CreativeAnalysisProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiLog: AiExecutionLogService,
    private readonly analysis: AnalysisService,
    private readonly jobRecord: JobRecordService,
    @Inject(TEXT_GENERATION_PROVIDER) private readonly textAi: TextGenerationProvider,
    @InjectQueue(EMBEDDING_QUEUE) private readonly embeddingQueue: Queue,
  ) {
    super();
  }

  async process(job: BullJob<{ sourceAdId: string }>): Promise<void> {
    const jobId = job.id!;
    const { sourceAdId } = job.data;
    await this.jobRecord.markRunning(jobId);
    try {
      await this.prisma.sourceAd.update({ where: { id: sourceAdId }, data: { status: 'ANALYZING' } });
      const inputText = await this.analysis.buildInputText(sourceAdId);

      const result = await this.aiLog.record(
        {
          provider: this.textAi.name,
          model: this.textAi.model,
          promptVersion: PROMPT_VERSION,
          inputRef: `sourceAd:${sourceAdId}`,
        },
        () =>
          generateJsonWithRepair(
            this.textAi,
            { system: SYSTEM_PROMPT, prompt: inputText, responseHint: 'creative-analysis' },
            creativeAnalysisSchema,
          ),
      );

      await this.prisma.creativeAnalysis.create({
        data: {
          sourceAdId,
          summary: result.summary,
          hookText: result.hook.text ?? null,
          hookType: result.hook.type,
          ctaText: result.callToAction.text ?? null,
          ctaType: result.callToAction.type ?? null,
          targetAudience: result.targetAudience,
          emotionalTriggers: result.emotionalTriggers,
          genres: result.genres,
          language: result.language,
          raw: result,
          provider: this.textAi.name,
          model: this.textAi.model,
          promptVersion: PROMPT_VERSION,
        },
      });

      const embJobId = generateEmbeddingJobId(sourceAdId);
      await this.embeddingQueue.add(
        JOB_TYPES.GENERATE_EMBEDDING,
        { sourceAdId, inputText },
        {
          jobId: embJobId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      await this.jobRecord.enqueue(embJobId, EMBEDDING_QUEUE, JOB_TYPES.GENERATE_EMBEDDING, { sourceAdId });

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

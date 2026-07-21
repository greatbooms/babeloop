import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob, Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiExecutionLogService, AiExecutionMeta } from '../modules/ai-log/ai-execution-log.service';
import { AnalysisService } from '../modules/creative-analysis/analysis.service';
import { creativeAnalysisSchema, PROMPT_VERSION } from '../modules/creative-analysis/creative-analysis.schema';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { generateJsonWithRepair } from '../providers/text/generate-json-with-repair';
import { TEXT_GENERATION_PROVIDER, TextGenerationProvider } from '../providers/text/text-generation.provider';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../providers/embedding/embedding.provider';
import { VectorSearchRepository } from '../modules/creative-analysis/vector-search.repository';
import { MEDIA_INSIGHT_PROMPT_VERSION, MEDIA_INSIGHT_SYSTEM, mediaInsightSchema } from '../modules/media/media-analysis.schema';
import {
  CREATIVE_ANALYSIS_QUEUE,
  EMBEDDING_QUEUE,
  generateEmbeddingJobId,
  JOB_TYPES,
} from './queue.constants';

const SYSTEM_PROMPT = `너는 광고 크리에이티브 분석가다. 주어진 광고 텍스트를 분석한다.

반드시 아래 JSON 구조로만 응답하라 (배열 값은 문자열 배열):
{"summary": "...", "hook": {"text": "훅 문구", "type": "훅 유형"}, "callToAction": {"text": "...", "type": "..."}, "targetAudience": ["..."], "emotionalTriggers": ["..."], "genres": ["..."], "language": "ko 또는 zh-TW 등"}`;

@Processor(CREATIVE_ANALYSIS_QUEUE)
export class CreativeAnalysisProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiLog: AiExecutionLogService,
    private readonly analysis: AnalysisService,
    private readonly jobRecord: JobRecordService,
    @Inject(TEXT_GENERATION_PROVIDER) private readonly textAi: TextGenerationProvider,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
    private readonly vectors: VectorSearchRepository,
    @InjectQueue(EMBEDDING_QUEUE) private readonly embeddingQueue: Queue,
  ) {
    super();
  }

  async process(job: BullJob<{ sourceAdId?: string; mediaAssetId?: string }>): Promise<void> {
    if (job.name === JOB_TYPES.ANALYZE_MEDIA) return this.analyzeMedia(job as BullJob<{ mediaAssetId: string }>);
    const jobId = job.id!;
    const sourceAdId = job.data.sourceAdId!;
    await this.jobRecord.markRunning(jobId);
    try {
      await this.prisma.sourceAd.update({ where: { id: sourceAdId }, data: { status: 'ANALYZING' } });
      const inputText = await this.analysis.buildInputText(sourceAdId);

      const meta: AiExecutionMeta = {
        provider: this.textAi.name,
        model: this.textAi.model,
        promptVersion: PROMPT_VERSION,
        inputRef: `sourceAd:${sourceAdId}`,
      };
      const result = await this.aiLog.record(meta, async () => {
          const { data, usage } = await generateJsonWithRepair(
            this.textAi,
            { system: SYSTEM_PROMPT, prompt: inputText, responseHint: 'creative-analysis' },
            creativeAnalysisSchema,
          );
          Object.assign(meta, usage);
          return data;
      });

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

  private async analyzeMedia(job: BullJob<{ mediaAssetId: string }>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const asset = await this.prisma.mediaAsset.findUniqueOrThrow({ where: { id: job.data.mediaAssetId }, include: { ocrResults: true, transcriptions: true } });
      const inputText = [...asset.ocrResults, ...asset.transcriptions].map((item) => item.text.trim()).filter(Boolean).join('\n');
      const meta: AiExecutionMeta = { provider: this.textAi.name, model: this.textAi.model, promptVersion: MEDIA_INSIGHT_PROMPT_VERSION, inputRef: `mediaAsset:${asset.id}` };
      const result = await this.aiLog.record(meta, async () => {
        const generated = await generateJsonWithRepair(this.textAi, { system: MEDIA_INSIGHT_SYSTEM, prompt: inputText, responseHint: 'media-insight' }, mediaInsightSchema);
        Object.assign(meta, generated.usage);
        return generated.data;
      });
      await this.prisma.mediaInsight.create({ data: { mediaAssetId: asset.id, ...result, raw: result, provider: this.textAi.name, model: this.textAi.model, promptVersion: MEDIA_INSIGHT_PROMPT_VERSION } });
      const embedding = await this.aiLog.record({ provider: this.embedder.name, model: this.embedder.model, inputRef: `mediaAsset:${asset.id}` }, () => this.embedder.embed(inputText));
      await this.vectors.upsertMediaEmbedding({ mediaAssetId: asset.id, model: this.embedder.model, dimension: this.embedder.dimension, vector: embedding });
      await this.jobRecord.markSucceeded(jobId, { mediaAssetId: asset.id, targetAudience: { length: result.targetAudience.length }, emotionalTriggers: { length: result.emotionalTriggers.length }, genres: { length: result.genres.length } });
    } catch (error) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await this.jobRecord.markFailed(jobId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}

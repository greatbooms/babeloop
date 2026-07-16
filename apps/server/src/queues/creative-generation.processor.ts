import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob, Queue } from 'bullmq';
import { CreativeType } from '../../generated/prisma';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiExecutionLogService } from '../modules/ai-log/ai-execution-log.service';
import { VectorSearchRepository } from '../modules/creative-analysis/vector-search.repository';
import {
  BRIEF_SYSTEM,
  buildBriefPrompt,
  buildVariantsPrompt,
  COPY_SYSTEM,
  SCRIPT_SYSTEM,
} from '../modules/generation/generation.prompts';
import {
  briefSchema,
  copyVariantsSchema,
  GENERATION_PROMPT_VERSIONS,
  videoScriptSchema,
} from '../modules/generation/generation.schemas';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../providers/embedding/embedding.provider';
import { generateJsonWithRepair } from '../providers/text/generate-json-with-repair';
import { TEXT_GENERATION_PROVIDER, TextGenerationProvider } from '../providers/text/text-generation.provider';
import {
  CREATIVE_GENERATION_QUEUE,
  JOB_TYPES,
  LOCALIZATION_QUEUE,
  localizeZhTwJobId,
} from './queue.constants';

interface GenerateBriefJobData {
  title: string | null;
  focusText: string | null;
  brandId: string | null;
  sourceAdIds: string[];
  createdById: string;
}

interface GenerateVariantsJobData {
  briefId: string;
  type: CreativeType;
  count: number;
}

@Processor(CREATIVE_GENERATION_QUEUE)
export class CreativeGenerationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiLog: AiExecutionLogService,
    private readonly jobRecord: JobRecordService,
    private readonly vectors: VectorSearchRepository,
    @Inject(TEXT_GENERATION_PROVIDER) private readonly textAi: TextGenerationProvider,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
    @InjectQueue(LOCALIZATION_QUEUE) private readonly localizationQueue: Queue,
  ) {
    super();
  }

  async process(job: BullJob): Promise<void> {
    if (job.name === JOB_TYPES.GENERATE_BRIEF) {
      return this.generateBrief(job as BullJob<GenerateBriefJobData>);
    }
    if (job.name === JOB_TYPES.GENERATE_COPY_VARIANTS) {
      return this.generateVariants(job as BullJob<GenerateVariantsJobData>);
    }
    throw new Error(`알 수 없는 잡: ${job.name}`);
  }

  private async generateBrief(job: BullJob<GenerateBriefJobData>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const sourceAdIds = await this.resolveSourceAdIds(job.data);
      const analyses = await this.prisma.creativeAnalysis.findMany({
        where: { sourceAdId: { in: sourceAdIds } },
        orderBy: { createdAt: 'desc' },
      });
      const latestBySourceAd = new Map<string, (typeof analyses)[number]>();
      for (const analysis of analyses) {
        if (!latestBySourceAd.has(analysis.sourceAdId)) {
          latestBySourceAd.set(analysis.sourceAdId, analysis);
        }
      }
      const latestAnalyses = sourceAdIds
        .map((sourceAdId) => latestBySourceAd.get(sourceAdId))
        .filter((analysis): analysis is (typeof analyses)[number] => Boolean(analysis));
      if (latestAnalyses.length === 0) throw new Error('참조할 분석이 없습니다');

      const referencePatterns = latestAnalyses
        .map(
          (analysis) =>
            [
              `- 광고 ${analysis.sourceAdId}`,
              `  훅 유형: ${analysis.hookType}`,
              `  타깃: ${analysis.targetAudience.join(', ')}`,
              `  감정 트리거: ${analysis.emotionalTriggers.join(', ')}`,
              `  장르: ${analysis.genres.join(', ')}`,
              `  요약: ${analysis.summary}`,
            ].join('\n'),
        )
        .join('\n');
      const brandContext = await this.buildBrandContext(job.data.brandId);
      const prompt = buildBriefPrompt({
        focusText: job.data.focusText ?? undefined,
        brandContext,
        referencePatterns,
      });
      const result = await this.aiLog.record(
        {
          provider: this.textAi.name,
          model: this.textAi.model,
          promptVersion: GENERATION_PROMPT_VERSIONS.brief,
          inputRef: `brief-request:${jobId}`,
        },
        () =>
          generateJsonWithRepair(
            this.textAi,
            { system: BRIEF_SYSTEM, prompt, responseHint: 'creative-brief' },
            briefSchema,
          ),
      );
      const brief = await this.prisma.creativeBrief.create({
        data: {
          title: job.data.title ?? result.title,
          audienceHypothesis: result.audienceHypothesis,
          desire: result.desire,
          hookType: result.hookType,
          messageAngle: result.messageAngle,
          visualFormat: result.visualFormat,
          callToAction: result.callToAction,
          rationale: result.rationale,
          focusText: job.data.focusText,
          sourceAdIds,
          brandId: job.data.brandId,
          raw: result,
          provider: this.textAi.name,
          model: this.textAi.model,
          promptVersion: GENERATION_PROMPT_VERSIONS.brief,
          createdById: job.data.createdById,
        },
      });
      await this.jobRecord.markSucceeded(jobId, { briefId: brief.id });
    } catch (error) {
      await this.failFinalAttempt(job, error);
      throw error;
    }
  }

  private async generateVariants(job: BullJob<GenerateVariantsJobData>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const brief = await this.prisma.creativeBrief.findUniqueOrThrow({ where: { id: job.data.briefId } });
      const briefSummary = [
        `제목: ${brief.title}`,
        `타깃 가설: ${brief.audienceHypothesis}`,
        `욕구: ${brief.desire}`,
        `훅 유형: ${brief.hookType}`,
        `메시지 각도: ${brief.messageAngle}`,
        `비주얼 형식: ${brief.visualFormat}`,
        `CTA: ${brief.callToAction}`,
        `근거: ${brief.rationale}`,
      ].join('\n');
      const prompt = buildVariantsPrompt({
        briefSummary,
        count: job.data.count,
        type: job.data.type,
      });
      const creativeIds: string[] = [];

      if (job.data.type === 'COPY') {
        const result = await this.aiLog.record(
          {
            provider: this.textAi.name,
            model: this.textAi.model,
            promptVersion: GENERATION_PROMPT_VERSIONS.copyVariants,
            inputRef: `brief:${brief.id}`,
          },
          () =>
            generateJsonWithRepair(
              this.textAi,
              { system: COPY_SYSTEM, prompt, responseHint: 'copy-variants' },
              copyVariantsSchema,
            ),
        );
        for (const [index, variant] of result.variants.slice(0, job.data.count).entries()) {
          const creative = await this.prisma.generatedCreative.create({
            data: {
              briefId: brief.id,
              type: 'COPY',
              variantIndex: index + 1,
              hookType: variant.hookType,
              koreanText: variant.koreanText,
              raw: variant,
              provider: this.textAi.name,
              model: this.textAi.model,
              promptVersion: GENERATION_PROMPT_VERSIONS.copyVariants,
              createdById: brief.createdById,
            },
          });
          creativeIds.push(creative.id);
          await this.enqueueLocalization(creative.id);
        }
      } else if (job.data.type === 'VIDEO_SCRIPT') {
        const result = await this.aiLog.record(
          {
            provider: this.textAi.name,
            model: this.textAi.model,
            promptVersion: GENERATION_PROMPT_VERSIONS.videoScript,
            inputRef: `brief:${brief.id}`,
          },
          () =>
            generateJsonWithRepair(
              this.textAi,
              { system: SCRIPT_SYSTEM, prompt, responseHint: 'video-script' },
              videoScriptSchema,
            ),
        );
        for (const [index, variant] of result.variants.slice(0, job.data.count).entries()) {
          const koreanText = variant.scenes
            .map(
              (scene) =>
                `${scene.seconds}s [${scene.visual}] ${scene.dialogue} (${scene.caption})`,
            )
            .join('\n');
          const creative = await this.prisma.generatedCreative.create({
            data: {
              briefId: brief.id,
              type: 'VIDEO_SCRIPT',
              variantIndex: index + 1,
              hookType: variant.hookType,
              koreanText,
              scenes: variant.scenes,
              raw: variant,
              provider: this.textAi.name,
              model: this.textAi.model,
              promptVersion: GENERATION_PROMPT_VERSIONS.videoScript,
              createdById: brief.createdById,
            },
          });
          creativeIds.push(creative.id);
          await this.enqueueLocalization(creative.id);
        }
      } else {
        throw new Error(`지원하지 않는 크리에이티브 타입: ${job.data.type}`);
      }

      await this.jobRecord.markSucceeded(jobId, { creativeIds });
    } catch (error) {
      await this.failFinalAttempt(job, error);
      throw error;
    }
  }

  private async resolveSourceAdIds(data: GenerateBriefJobData): Promise<string[]> {
    if (data.sourceAdIds.length > 0) return [...new Set(data.sourceAdIds)];
    if (!data.focusText) return [];
    const vector = await this.aiLog.record(
      {
        provider: this.embedder.name,
        model: this.embedder.model,
        inputRef: 'brief-focus-text',
      },
      () => this.embedder.embed(data.focusText!),
    );
    const hits = await this.vectors.searchSimilar({
      vector,
      model: this.embedder.model,
      limit: 3,
    });
    return hits.map((hit) => hit.sourceAdId);
  }

  private async buildBrandContext(brandId: string | null): Promise<string> {
    if (!brandId) return 'BabeChat — AI 캐릭터챗, 대만 시장';
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
      include: { features: true, guidelines: true },
    });
    if (!brand) throw new Error('브랜드를 찾을 수 없습니다');
    return [
      `브랜드: ${brand.name}`,
      brand.description ? `설명: ${brand.description}` : null,
      ...brand.features.map((feature) => `기능: ${feature.name} — ${feature.description}`),
      ...brand.guidelines.map((guideline) => `가이드라인: ${guideline.title} — ${guideline.content}`),
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async enqueueLocalization(creativeId: string): Promise<void> {
    const jobId = localizeZhTwJobId(creativeId);
    const payload = { creativeId };
    await this.localizationQueue.add(JOB_TYPES.LOCALIZE_ZH_TW, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    await this.jobRecord.enqueue(jobId, LOCALIZATION_QUEUE, JOB_TYPES.LOCALIZE_ZH_TW, payload);
  }

  private async failFinalAttempt(job: BullJob, error: unknown): Promise<void> {
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      const message = error instanceof Error ? error.message : String(error);
      await this.jobRecord.markFailed(job.id!, message);
    }
  }
}

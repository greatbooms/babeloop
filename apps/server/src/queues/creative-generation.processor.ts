import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { CreativeType } from '../../generated/prisma';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { resizeImageToSpec } from '../common/media/image-resize';
import {
  computeOverlayLayout,
  renderTextOverlay,
  type OverlayColor,
  type OverlayFont,
} from '../common/media/text-overlay';
import { AiExecutionLogService, AiExecutionMeta } from '../modules/ai-log/ai-execution-log.service';
import { VectorSearchRepository } from '../modules/creative-analysis/vector-search.repository';
import {
  BRIEF_SYSTEM,
  appendReferenceImages,
  buildBriefPrompt,
  buildImagePrompt,
  buildVideoPrompt,
  buildVariantsPrompt,
  COPY_SYSTEM,
  SCRIPT_SYSTEM,
  BRAND_TRANSLATION_SYSTEM,
  buildBrandTranslationPrompt,
  buildAiTypographyStyle,
  type AiTypoStyle,
} from '../modules/generation/generation.prompts';
import {
  briefSchema,
  copyVariantsSchema,
  GENERATION_PROMPT_VERSIONS,
  videoScriptSchema,
  brandTranslationSchema,
} from '../modules/generation/generation.schemas';
import { buildSizePromptSection, resolveSizePreset } from '../modules/generation/image-size-presets';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../providers/embedding/embedding.provider';
import {
  IMAGE_GENERATION_PROVIDER,
  ImageGenerationProvider,
} from '../providers/image/image-generation.provider';
import { generateJsonWithRepair } from '../providers/text/generate-json-with-repair';
import { TEXT_GENERATION_PROVIDER, TextGenerationProvider } from '../providers/text/text-generation.provider';
import {
  VIDEO_GENERATION_PROVIDER,
  VideoGenerationProvider,
} from '../providers/video/video-generation.provider';
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
  performanceContext?: {
    trackingCode: string;
    hookType: string | null;
    koreanText: string;
    signups: number | null;
    installs: number | null;
    clicks: number | null;
    impressions: number | null;
  };
}

interface GenerateVariantsJobData {
  briefId: string;
  type: CreativeType;
  count: number;
}

interface GenerateImagesJobData {
  briefId: string;
  creativeId: string;
  instructions: string;
  count: number;
  quality: 'low' | 'high';
  sizePreset: string;
  referenceKeys: string[];
  overlayHeadline?: string;
  overlaySubline?: string;
  overlayMode?: 'SERVER' | 'AI';
  overlayFont?: OverlayFont;
  overlayColor?: OverlayColor;
  aiTypoStyle?: AiTypoStyle;
}

interface GenerateVideoJobData {
  creativeId: string;
  seconds: 4 | 8 | 12;
  instructions: string;
  referenceKey: string | null;
}

interface TranslateBrandJobData { brandId: string }

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
    private readonly storage: StorageService,
    @Inject(IMAGE_GENERATION_PROVIDER) private readonly imageAi: ImageGenerationProvider,
    @Inject(VIDEO_GENERATION_PROVIDER) private readonly videoAi: VideoGenerationProvider,
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
    if (job.name === JOB_TYPES.GENERATE_IMAGES) {
      return this.generateImages(job as BullJob<GenerateImagesJobData>);
    }
    if (job.name === JOB_TYPES.GENERATE_VIDEO) {
      return this.generateVideo(job as BullJob<GenerateVideoJobData>);
    }
    if (job.name === JOB_TYPES.TRANSLATE_BRAND) {
      return this.translateBrand(job as BullJob<TranslateBrandJobData>);
    }
    throw new Error(`알 수 없는 잡: ${job.name}`);
  }

  private async translateBrand(job: BullJob<TranslateBrandJobData>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const brand = await this.prisma.brand.findUniqueOrThrow({ where: { id: job.data.brandId }, include: { features: true, guidelines: true } });
      const meta: AiExecutionMeta = { provider: this.textAi.name, model: this.textAi.model, promptVersion: GENERATION_PROMPT_VERSIONS.translateBrand, inputRef: `brand:${brand.id}` };
      const result = await this.aiLog.record(meta, async () => {
        const generated = await generateJsonWithRepair(this.textAi, { system: BRAND_TRANSLATION_SYSTEM, prompt: buildBrandTranslationPrompt(brand), responseHint: 'brand-zh-tw-translation' }, brandTranslationSchema);
        Object.assign(meta, generated.usage);
        return generated.data;
      });
      const translatedAt = new Date();
      await this.prisma.brand.update({ where: { id: brand.id }, data: { zhTw: result.zhTw, koFields: result.ko, zhTwTranslatedAt: translatedAt, updatedAt: translatedAt } });
      await this.jobRecord.markSucceeded(jobId, { brandId: brand.id });
    } catch (error) {
      await this.failFinalAttempt(job, error);
      throw error;
    }
  }

  private async generateBrief(job: BullJob<GenerateBriefJobData>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const references = await this.resolveSourceAdIds(job.data);
      const sourceAdIds = references.map((reference) => reference.sourceAdId);
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
      const performanceSection = job.data.performanceContext
        ? `추적코드 ${job.data.performanceContext.trackingCode} — 훅: ${job.data.performanceContext.hookType ?? 'none'}, 가입 ${job.data.performanceContext.signups ?? '?'}건/설치 ${job.data.performanceContext.installs ?? '?'}건\n문구: ${job.data.performanceContext.koreanText}`
        : undefined;
      const prompt = buildBriefPrompt({
        focusText: job.data.focusText ?? undefined,
        brandContext,
        referencePatterns,
        performanceSection,
      });
      const meta: AiExecutionMeta = {
        provider: this.textAi.name,
        model: this.textAi.model,
        promptVersion: GENERATION_PROMPT_VERSIONS.brief,
        inputRef: `brief-request:${jobId}`,
      };
      const result = await this.aiLog.record(meta, async () => {
          const { data, usage } = await generateJsonWithRepair(
            this.textAi,
            { system: BRIEF_SYSTEM, prompt, responseHint: 'creative-brief' },
            briefSchema,
          );
          Object.assign(meta, usage);
          return data;
      });
      const referenceAds = await this.prisma.sourceAd.findMany({ where: { id: { in: sourceAdIds } }, select: { id: true, title: true } });
      const titles = new Map(referenceAds.map((ad) => [ad.id, ad.title]));
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
          zhTwFields: result.zhTw,
          focusText: job.data.focusText,
          sourceAdIds,
          brandId: job.data.brandId,
          raw: job.data.performanceContext
            ? { ...result, performanceContext: job.data.performanceContext }
            : result,
          provider: this.textAi.name,
          model: this.textAi.model,
          promptVersion: GENERATION_PROMPT_VERSIONS.brief,
          createdById: job.data.createdById,
          references: { create: references.map((reference, rank) => ({ ...reference, rank, titleSnapshot: titles.get(reference.sourceAdId) ?? null })) },
        },
      });
      await this.jobRecord.markSucceeded(jobId, { briefId: brief.id });
    } catch (error) {
      await this.failFinalAttempt(job, error);
      throw error;
    }
  }

  private async generateImages(job: BullJob<GenerateImagesJobData>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      // 이미지 생성은 승인된 문구에서만 — 브리프 단독 경로는 비용 이중 지출 문제로 제거됨
      const creative = await this.prisma.generatedCreative.findUniqueOrThrow({
        where: { id: job.data.creativeId },
        include: {
          brief: { include: { brand: { include: { features: true } } } },
          localizations: {
            where: { locale: 'zh-TW', kind: 'APPROVED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
      const brief = creative.brief;
      const sizePreset = resolveSizePreset(job.data.sizePreset);
      const referenceKeys = job.data.referenceKeys ?? [];
      const referenceImages = await this.loadReferenceImages(referenceKeys);
      const overlayHeadline = job.data.overlayHeadline?.trim() || null;
      const overlaySubline = overlayHeadline
        ? job.data.overlaySubline?.trim() || null
        : null;
      const overlayMode = job.data.overlayMode ?? 'SERVER';
      const overlayFont = job.data.overlayFont ?? 'gothic';
      const overlayColor = job.data.overlayColor ?? 'white';
      const aiTypoStyle = job.data.aiTypoStyle ?? 'selected';
      const prompt = appendReferenceImages(
        [
          buildImagePrompt({
            brief,
            brandName: brief.brand?.name ?? 'BabeChat',
            brandDescription: brief.brand?.description,
            creative: {
              koreanText: creative.koreanText,
              approvedZhTw: creative.localizations[0]?.text,
            },
            ...(overlayMode === 'AI' && overlayHeadline
              ? {
                  typography: {
                    headline: overlayHeadline,
                    subline: overlaySubline,
                    style: buildAiTypographyStyle({
                      style: aiTypoStyle,
                      font: overlayFont,
                      color: overlayColor,
                    }),
                  },
                }
              : {}),
            instructions: job.data.instructions,
          }),
          buildSizePromptSection(sizePreset),
        ].join('\n\n'),
        referenceKeys,
      );
      const promptVersion =
        overlayMode === 'AI'
          ? 'generate-copy-images@v5'
          : 'generate-copy-images@v4';
      const meta: AiExecutionMeta = {
        provider: this.imageAi.name,
        model: this.imageAi.model,
        promptVersion,
        inputRef: `creative:${creative.id}`,
      };
      let generated:
        | Awaited<ReturnType<ImageGenerationProvider['generate']>>
        | undefined;
      await this.aiLog.record(meta, async () => {
        generated = await this.imageAi.generate({
          prompt,
          count: job.data.count,
          quality: job.data.quality,
          size: sizePreset.nativeSize,
          ...(referenceImages.length ? { referenceImages } : {}),
        });
        meta.costEstimateUsd = generated.costEstimateUsd;
        return {
          imageCount: generated.images.length,
          contentTypes: generated.images.map((image) => image.contentType),
        };
      });
      if (!generated) throw new Error('이미지 생성 결과가 없습니다');

      const imageIds: string[] = [];
      const costPerImage =
        generated.costEstimateUsd === undefined || generated.images.length === 0
          ? undefined
          : generated.costEstimateUsd / generated.images.length;
      for (const image of generated.images) {
        const imageId = randomUUID();
        const storageKey = `generated-images/${brief.id}/${imageId}.png`;
        const resized = await resizeImageToSpec(image.buffer, sizePreset.width, sizePreset.height);
        const cleanStorageKey = overlayMode === 'SERVER' && overlayHeadline
          ? `generated-images/${brief.id}/${imageId}-clean.png`
          : null;

        if (cleanStorageKey && overlayHeadline) {
          await this.storage.putBuffer(cleanStorageKey, resized, 'image/png');
          const layout = computeOverlayLayout({
            width: sizePreset.width,
            height: sizePreset.height,
            group: sizePreset.group,
            headline: overlayHeadline,
            ...(overlaySubline ? { subline: overlaySubline } : {}),
          });
          const overlaid = await renderTextOverlay(resized, layout, {
            font: overlayFont,
            color: overlayColor,
          });
          await this.storage.putBuffer(storageKey, overlaid, 'image/png');
        } else {
          await this.storage.putBuffer(storageKey, resized, 'image/png');
        }
        const saved = await this.prisma.generatedImage.create({
          data: {
            briefId: brief.id,
            creativeId: creative.id,
            storageKey,
            cleanStorageKey,
            overlayHeadline,
            overlaySubline,
            overlayMode,
            overlayFont,
            overlayColor,
            contentType: 'image/png',
            quality: job.data.quality,
            instructions: job.data.instructions,
            prompt,
            provider: this.imageAi.name,
            model: this.imageAi.model,
            promptVersion,
            sizePreset: sizePreset.id,
            referenceKeys,
            costEstimateUsd: costPerImage,
          },
        });
        imageIds.push(saved.id);
      }
      await this.jobRecord.markSucceeded(jobId, { imageIds });
    } catch (error) {
      await this.failFinalAttempt(job, error);
      throw error;
    }
  }

  private async generateVideo(job: BullJob<GenerateVideoJobData>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const creative = await this.prisma.generatedCreative.findUniqueOrThrow({
        where: { id: job.data.creativeId },
        include: { brief: { include: { brand: true } } },
      });
      const size = '720x1280';
      const referenceKeys = job.data.referenceKey ? [job.data.referenceKey] : [];
      const [inputReference] = await this.loadReferenceImages(referenceKeys);
      const prompt = appendReferenceImages(
        buildVideoPrompt({
          scenes: creative.scenes,
          seconds: job.data.seconds,
          hookType: creative.brief.hookType,
          desire: creative.brief.desire,
          brandName: creative.brief.brand?.name ?? 'BabeChat',
          instructions: job.data.instructions,
        }),
        referenceKeys,
      );
      const promptVersion = referenceKeys.length ? 'generate-video@v2' : 'generate-video@v1';
      const meta: AiExecutionMeta = {
        provider: this.videoAi.name,
        model: this.videoAi.model,
        promptVersion,
        inputRef: `creative:${creative.id}`,
      };
      let generated: Awaited<ReturnType<VideoGenerationProvider['generate']>> | undefined;
      await this.aiLog.record(meta, async () => {
        generated = await this.videoAi.generate({
          prompt,
          seconds: job.data.seconds,
          size,
          ...(inputReference ? { inputReference } : {}),
        });
        meta.costEstimateUsd = generated.costEstimateUsd;
        return {
          contentType: generated.video.contentType,
          byteLength: generated.video.buffer.length,
        };
      });
      if (!generated) throw new Error('영상 생성 결과가 없습니다');

      const storageKey = `generated-videos/${creative.id}/${randomUUID()}.mp4`;
      await this.storage.putBuffer(storageKey, generated.video.buffer, generated.video.contentType);
      const saved = await this.prisma.generatedVideo.create({
        data: {
          creativeId: creative.id,
          storageKey,
          contentType: generated.video.contentType,
          seconds: job.data.seconds,
          size,
          prompt,
          instructions: job.data.instructions || null,
          provider: this.videoAi.name,
          model: this.videoAi.model,
          promptVersion,
          referenceKeys,
          costEstimateUsd: generated.costEstimateUsd,
        },
      });
      await this.jobRecord.markSucceeded(jobId, { videoId: saved.id });
    } catch (error) {
      await this.failFinalAttempt(job, error);
      throw error;
    }
  }

  private async generateVariants(job: BullJob<GenerateVariantsJobData>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const brief = await this.prisma.creativeBrief.findUniqueOrThrow({
        where: { id: job.data.briefId },
        include: { brand: { include: { features: true } } },
      });
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
      // 영상 스크립트는 제품 동작을 장면으로 그려야 하므로 브랜드 기능 정보를 함께 전달한다
      const brandContext =
        job.data.type === 'VIDEO_SCRIPT' && brief.brand
          ? [
              `${brief.brand.name}${brief.brand.description ? ` — ${brief.brand.description}` : ''}`,
              ...(brief.brand.features ?? []).map((feature) => `- ${feature.name}: ${feature.description}`),
            ].join('\n')
          : undefined;
      const prompt = buildVariantsPrompt({
        briefSummary,
        count: job.data.count,
        type: job.data.type,
        brandContext,
      });
      const creativeIds: string[] = [];

      if (job.data.type === 'COPY') {
        const meta: AiExecutionMeta = {
          provider: this.textAi.name,
          model: this.textAi.model,
          promptVersion: GENERATION_PROMPT_VERSIONS.copyVariants,
          inputRef: `brief:${brief.id}`,
        };
        const result = await this.aiLog.record(meta, async () => {
            const { data, usage } = await generateJsonWithRepair(
              this.textAi,
              { system: COPY_SYSTEM, prompt, responseHint: 'copy-variants' },
              copyVariantsSchema,
            );
            Object.assign(meta, usage);
            return data;
        });
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
        const meta: AiExecutionMeta = {
          provider: this.textAi.name,
          model: this.textAi.model,
          promptVersion: GENERATION_PROMPT_VERSIONS.videoScript,
          inputRef: `brief:${brief.id}`,
        };
        const result = await this.aiLog.record(meta, async () => {
            const { data, usage } = await generateJsonWithRepair(
              this.textAi,
              { system: SCRIPT_SYSTEM, prompt, responseHint: 'video-script' },
              videoScriptSchema,
            );
            Object.assign(meta, usage);
            return data;
        });
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

  private async resolveSourceAdIds(data: GenerateBriefJobData): Promise<Array<{ sourceAdId: string; method: 'MANUAL' | 'SIMILARITY'; similarity: number | null }>> {
    if (data.sourceAdIds.length > 0) return [...new Set(data.sourceAdIds)].map((sourceAdId) => ({ sourceAdId, method: 'MANUAL', similarity: null }));
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
    return hits.map((hit) => ({ sourceAdId: hit.sourceAdId, method: 'SIMILARITY', similarity: hit.similarity }));
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

  private loadReferenceImages(
    referenceKeys: string[],
  ): Promise<Array<{ buffer: Buffer; contentType: string }>> {
    return Promise.all(
      referenceKeys.map(async (key) => ({
        buffer: await this.storage.getBuffer(key),
        contentType: this.referenceContentType(key),
      })),
    );
  }

  private referenceContentType(storageKey: string): string {
    const normalized = storageKey.toLowerCase();
    if (/\.jpe?g$/.test(normalized)) return 'image/jpeg';
    if (normalized.endsWith('.webp')) return 'image/webp';
    return 'image/png';
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

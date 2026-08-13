import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { GraphQLError } from 'graphql';
import { User } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  CREATIVE_GENERATION_QUEUE,
  generateBriefJobId,
  generateCopyVariantsJobId,
  generateImagesJobId,
  generateVideoJobId,
  JOB_TYPES,
} from '../../queues/queue.constants';
import { JobRecordService } from '../jobs/job-record.service';
import { PerformanceService } from '../performance/performance.service';
import {
  GenerateCreativeBriefInput,
  GenerateCreativeImagesInput,
  GenerateCreativeVideoInput,
  GenerateCreativeVariantsInput,
  GenerationReferenceInput,
  GenerationReferenceKind,
} from './brief.inputs';
import { resolveSizePreset } from './image-size-presets';

export const BRIEF_INCLUDE = {
  brand: true,
  references: { orderBy: { rank: 'asc' as const }, include: { sourceAd: { select: { id: true, title: true } } } },
  creatives: {
    orderBy: { variantIndex: 'asc' as const },
    include: { localizations: { orderBy: { createdAt: 'desc' as const } } },
  },
} as const;

export const BRIEF_DETAIL_INCLUDE = {
  ...BRIEF_INCLUDE,
  images: { orderBy: { createdAt: 'desc' as const } },
} as const;

@Injectable()
export class BriefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobRecord: JobRecordService,
    private readonly performance: PerformanceService,
    @InjectQueue(CREATIVE_GENERATION_QUEUE) private readonly queue: Queue,
    private readonly storage: StorageService,
  ) {}

  async requestBrief(user: User, input: GenerateCreativeBriefInput) {
    if (!input.focusText && (!input.sourceAdIds || input.sourceAdIds.length === 0)) {
      throw new GraphQLError('focusText 또는 sourceAdIds 중 하나는 필요합니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const requestId = randomUUID();
    const jobId = generateBriefJobId(requestId);
    const payload = {
      title: input.title ?? null,
      focusText: input.focusText ?? null,
      brandId: input.brandId ?? null,
      sourceAdIds: input.sourceAdIds ?? [],
      createdById: user.id,
    };
    await this.queue.add(JOB_TYPES.GENERATE_BRIEF, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    const job = await this.jobRecord.enqueue(
      jobId,
      CREATIVE_GENERATION_QUEUE,
      JOB_TYPES.GENERATE_BRIEF,
      payload,
    );
    return { job };
  }

  async requestVariants(input: GenerateCreativeVariantsInput) {
    await this.prisma.creativeBrief.findUniqueOrThrow({ where: { id: input.briefId } }).catch(() => {
      throw new GraphQLError('브리프를 찾을 수 없습니다', { extensions: { code: 'NOT_FOUND' } });
    });
    const jobId = generateCopyVariantsJobId(input.briefId, randomUUID());
    const payload = { briefId: input.briefId, type: input.type, count: input.count };
    await this.queue.add(JOB_TYPES.GENERATE_COPY_VARIANTS, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    const job = await this.jobRecord.enqueue(
      jobId,
      CREATIVE_GENERATION_QUEUE,
      JOB_TYPES.GENERATE_COPY_VARIANTS,
      payload,
    );
    return { job };
  }

  async requestCreativeImages(input: GenerateCreativeImagesInput) {
    this.validateImageRequest(input.count, input.quality, input.references?.length ?? 0);
    const sizePreset = resolveSizePreset(input.sizePreset);
    const creative = await this.prisma.generatedCreative.findUnique({
      where: { id: input.creativeId },
      select: { id: true, briefId: true, type: true, status: true },
    });
    if (!creative || creative.type !== 'COPY' || creative.status !== 'APPROVED') {
      throw new GraphQLError('APPROVED 문구에서만 생성할 수 있습니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const referenceKeys = await this.resolveGenerationReferences(input.references ?? []);
    const payload = {
      briefId: creative.briefId,
      creativeId: creative.id,
      instructions: input.instructions?.trim() ?? '',
      count: input.count,
      quality: input.quality,
      sizePreset: sizePreset.id,
      referenceKeys,
    };
    return this.jobRecord.enqueueOrRetry(
      this.queue,
      CREATIVE_GENERATION_QUEUE,
      JOB_TYPES.GENERATE_IMAGES,
      generateImagesJobId(creative.id, randomUUID()),
      payload,
    );
  }

  async requestCreativeVideo(input: GenerateCreativeVideoInput) {
    if (input.seconds !== 4 && input.seconds !== 8 && input.seconds !== 12) {
      throw new GraphQLError('영상 길이는 4초, 8초, 12초 중 하나여야 합니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const creative = await this.prisma.generatedCreative.findUnique({
      where: { id: input.creativeId },
      select: { id: true, briefId: true, type: true, status: true },
    });
    if (!creative || creative.type !== 'VIDEO_SCRIPT' || creative.status !== 'APPROVED') {
      throw new GraphQLError('APPROVED 장면표에서만 생성할 수 있습니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const referenceKey = input.referenceImageId
      ? (
          await this.resolveGenerationReferences([
            {
              kind: GenerationReferenceKind.GENERATED_IMAGE,
              id: input.referenceImageId,
            },
          ], creative.briefId)
        )[0]
      : null;
    const payload = {
      creativeId: creative.id,
      seconds: input.seconds,
      instructions: input.instructions?.trim() ?? '',
      referenceKey,
    };
    return this.jobRecord.enqueueOrRetry(
      this.queue,
      CREATIVE_GENERATION_QUEUE,
      JOB_TYPES.GENERATE_VIDEO,
      generateVideoJobId(creative.id, randomUUID()),
      payload,
    );
  }

  private validateImageRequest(count: number, quality: string, referenceCount: number): void {
    if (!Number.isInteger(count) || count < 1 || count > 4) {
      throw new GraphQLError('이미지 장수는 1~4장이어야 합니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    if (quality !== 'low' && quality !== 'high') {
      throw new GraphQLError('이미지 품질은 low 또는 high여야 합니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    if (referenceCount > 16) {
      throw new GraphQLError('참고 이미지는 최대 16장까지 선택할 수 있습니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
  }

  // [보안 결정 2026-08-12] 참조 조회에 소유자 스코프를 걸지 않는 이유:
  // BabeLoop은 단일 팀 내부 도구로 테넌트·소유권 모델이 없고, 여기서 참조 가능한
  // 세 자원(시안·경쟁 광고·미디어 자산)은 로그인한 모든 팀원이 기존 목록/상세 쿼리로
  // 이미 열람·다운로드할 수 있는 공유 자산이다(같은 GqlAuthGuard+Roles 관문).
  // 경쟁 광고·미디어 자산을 브리프 경계 밖에서 참조하는 것은 의도된 설계(스타일 레퍼런스).
  // 멀티 테넌트로 확장하는 날, 이 함수의 각 분기에 테넌트 스코프 조건을 추가할 것.
  private async resolveGenerationReferences(
    references: GenerationReferenceInput[],
    expectedBriefId?: string,
  ): Promise<string[]> {
    return Promise.all(
      references.map(async (reference) => {
        if (reference.kind === GenerationReferenceKind.GENERATED_IMAGE) {
          const image = await this.prisma.generatedImage.findUnique({
            where: { id: reference.id },
            select: { briefId: true, storageKey: true },
          });
          if (!image || (expectedBriefId && image.briefId !== expectedBriefId)) {
            this.invalidReference(reference);
          }
          return image.storageKey;
        }

        if (reference.kind === GenerationReferenceKind.SOURCE_AD) {
          const sourceAd = await this.prisma.sourceAd.findUnique({
            where: { id: reference.id },
            select: {
              mediaAsset: {
                select: { kind: true, storageKey: true, thumbnailKey: true },
              },
            },
          });
          const key = sourceAd?.mediaAsset
            ? this.imageKeyForMediaAsset(sourceAd.mediaAsset)
            : null;
          if (!key) this.invalidReference(reference);
          return key;
        }

        if (reference.kind === GenerationReferenceKind.MEDIA_ASSET) {
          const mediaAsset = await this.prisma.mediaAsset.findUnique({
            where: { id: reference.id },
            select: { kind: true, storageKey: true, thumbnailKey: true },
          });
          const key = mediaAsset ? this.imageKeyForMediaAsset(mediaAsset) : null;
          if (!key) this.invalidReference(reference);
          return key;
        }

        return this.invalidReference(reference);
      }),
    );
  }

  private imageKeyForMediaAsset(asset: {
    kind: string;
    storageKey: string;
    thumbnailKey: string | null;
  }): string | null {
    return asset.kind === 'IMAGE' ? asset.storageKey : asset.thumbnailKey;
  }

  private invalidReference(reference: GenerationReferenceInput): never {
    throw new GraphQLError(
      `참고 항목 ${reference.kind}:${reference.id}에서 사용할 이미지 파일을 찾을 수 없습니다`,
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }

  async requestBriefFromPerformance(user: User, experimentId: string) {
    const ranked = await this.performance.variantPerformance(experimentId);
    const top =
      ranked.find((variant) => variant.signups !== null) ??
      ranked.find((variant) => variant.installs !== null);
    if (!top) {
      throw new GraphQLError('브리프에 환류할 성과 데이터가 없습니다', {
        extensions: { code: 'NO_PERFORMANCE_DATA' },
      });
    }
    const creative = await this.prisma.generatedCreative.findUniqueOrThrow({
      where: { id: top.creativeId },
      include: { brief: true },
    });
    const performanceContext = {
      trackingCode: top.trackingCode,
      hookType: creative.hookType,
      koreanText: creative.koreanText,
      signups: top.signups,
      installs: top.installs,
      clicks: top.clicks,
      impressions: top.impressions,
    };
    const jobId = generateBriefJobId(randomUUID());
    const payload = {
      title: null,
      focusText: creative.koreanText,
      brandId: creative.brief.brandId,
      sourceAdIds: [],
      createdById: user.id,
      performanceContext,
    };
    await this.queue.add(JOB_TYPES.GENERATE_BRIEF, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    const job = await this.jobRecord.enqueue(
      jobId,
      CREATIVE_GENERATION_QUEUE,
      JOB_TYPES.GENERATE_BRIEF,
      payload,
    );
    return { job };
  }

  async findAll(search?: string, brandId?: string) {
    const trimmed = search?.trim();
    const briefs = await this.prisma.creativeBrief.findMany({
      where: {
        brandId: brandId ?? undefined,
        OR: trimmed
          ? [
              { title: { contains: trimmed, mode: 'insensitive' } },
              { focusText: { contains: trimmed, mode: 'insensitive' } },
              { hookType: { contains: trimmed, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: BRIEF_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return briefs.map((brief) => this.mapBrief(brief));
  }

  async findById(id: string) {
    const brief = await this.prisma.creativeBrief.findUnique({
      where: { id },
      include: BRIEF_DETAIL_INCLUDE,
    });
    if (!brief) throw new NotFoundException('브리프를 찾을 수 없습니다');
    return {
      ...this.mapBrief(brief),
      images: await Promise.all(
        brief.images.map(async (image) => ({
          id: image.id,
          url: await this.storage.presignGet(image.storageKey),
          quality: image.quality,
          instructions: image.instructions,
          prompt: image.prompt,
          sizePreset: image.sizePreset,
          referenceKeys: image.referenceKeys,
          createdAt: image.createdAt,
          costEstimateUsd: image.costEstimateUsd,
        })),
      ),
    };
  }

  private mapBrief<T extends { raw: unknown; zhTwFields?: unknown; references: Array<{ sourceAdId: string | null; titleSnapshot: string | null; method: string; similarity: number | null; sourceAd: { id: string; title: string | null } | null }>; creatives: Array<{ scenes: unknown }> }>(brief: T) {
    return {
      ...brief,
      references: brief.references.map((reference) => ({ sourceAdId: reference.sourceAdId, title: reference.sourceAd?.title ?? reference.titleSnapshot, method: reference.method, similarity: reference.similarity, deleted: reference.sourceAd === null })),
      rawJson: JSON.stringify(brief.raw),
      zhTwJson: brief.zhTwFields ? JSON.stringify(brief.zhTwFields) : null,
      images: [],
      creatives: brief.creatives.map((creative) => ({
        ...creative,
        scenesJson: creative.scenes ? JSON.stringify(creative.scenes) : null,
      })),
    };
  }
}

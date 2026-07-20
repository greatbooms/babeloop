import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { GraphQLError } from 'graphql';
import { Prisma, User } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  analyzeCreativeJobId,
  CREATIVE_ANALYSIS_QUEUE,
  downloadExternalMediaJobId,
  EMBEDDING_QUEUE,
  generateEmbeddingJobId,
  JOB_TYPES,
  MEDIA_PROCESSING_QUEUE,
} from '../../queues/queue.constants';
import { JobRecordService } from '../jobs/job-record.service';
import { VectorSearchRepository } from '../creative-analysis/vector-search.repository';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../../providers/embedding/embedding.provider';
import { CreateSourceAdInput, SourceAdFilterInput } from './source-ad.inputs';

export const SOURCE_AD_INCLUDE = {
  competitor: true,
  mediaAsset: { include: { ocrResults: true, transcriptions: true } },
  analyses: { orderBy: { createdAt: 'desc' as const }, take: 1 },
} as const;

export function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = '';
  u.searchParams.sort();
  u.hostname = u.hostname.toLowerCase();
  return u.toString();
}

@Injectable()
export class SourceAdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobRecord: JobRecordService,
    @InjectQueue(CREATIVE_ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
    @InjectQueue(EMBEDDING_QUEUE) private readonly embeddingQueue: Queue,
    @InjectQueue(MEDIA_PROCESSING_QUEUE) private readonly mediaQueue: Queue,
    private readonly vectors: VectorSearchRepository,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
    private readonly storage: StorageService,
  ) {}

  private mapSourceAd<T extends { analyses: unknown[] }>(ad: T) {
    return { ...ad, latestAnalysis: ad.analyses[0] ?? null };
  }

  private async mapSourceAdWithThumbnail<T extends { analyses: unknown[]; mediaAsset: { kind: string; status: string; storageKey: string } | null }>(ad: T) {
    const mapped = this.mapSourceAd(ad);
    if (!ad.mediaAsset) return mapped;
    const canShowImage = ad.mediaAsset.kind === 'IMAGE' && ['READY', 'UPLOADED'].includes(ad.mediaAsset.status);
    return {
      ...mapped,
      mediaAsset: {
        ...ad.mediaAsset,
        thumbnailUrl: canShowImage ? await this.storage.presignGet(ad.mediaAsset.storageKey) : null,
      },
    };
  }

  private async enqueueAnalysis(sourceAdId: string) {
    const jobId = analyzeCreativeJobId(sourceAdId);
    await this.analysisQueue.add(
      JOB_TYPES.ANALYZE_CREATIVE,
      { sourceAdId },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    return this.jobRecord.enqueue(jobId, CREATIVE_ANALYSIS_QUEUE, JOB_TYPES.ANALYZE_CREATIVE, { sourceAdId });
  }

  async create(_user: User, input: CreateSourceAdInput) {
    if (!input.adText && !input.sourceUrl) {
      throw new GraphQLError('adText 또는 sourceUrl 중 하나는 필요합니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const externalId = input.sourceUrl ? normalizeUrl(input.sourceUrl) : null;
    if (externalId) {
      const existing = await this.prisma.sourceAd.findUnique({ where: { externalId } });
      if (existing) {
        throw new GraphQLError(`이미 등록된 광고입니다: ${existing.id}`, {
          extensions: { code: 'DUPLICATE_SOURCE_AD', existingId: existing.id },
        });
      }
    }
    const created = await this.prisma.sourceAd.create({
      data: {
        origin: input.sourceUrl ? 'MANUAL_URL' : 'MANUAL_FILE',
        title: input.title,
        adText: input.adText,
        sourceUrl: input.sourceUrl,
        externalId,
        competitorId: input.competitorId,
        networks: [],
        countries: [],
        provider: 'manual',
        confidence: 'HIGH',
        isEstimated: false,
      },
      include: SOURCE_AD_INCLUDE,
    });
    const job = input.adText ? await this.enqueueAnalysis(created.id) : null;
    return { sourceAd: this.mapSourceAd(created), job };
  }

  async analyze(sourceAdId: string) {
    await this.findById(sourceAdId);
    return this.enqueueAnalysis(sourceAdId);
  }

  async reembedAnalyzed(): Promise<{ enqueued: number }> {
    const ads = await this.prisma.sourceAd.findMany({ where: { status: 'ANALYZED' }, select: { id: true } });
    for (const ad of ads) {
      const jobId = generateEmbeddingJobId(ad.id);
      const payload = { sourceAdId: ad.id };
      await this.embeddingQueue.add(JOB_TYPES.GENERATE_EMBEDDING, payload, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
      await this.jobRecord.enqueue(jobId, EMBEDDING_QUEUE, JOB_TYPES.GENERATE_EMBEDDING, payload);
    }
    return { enqueued: ads.length };
  }

  async findAll() {
    const ads = await this.prisma.sourceAd.findMany({
      include: SOURCE_AD_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return ads.map((ad) => this.mapSourceAd(ad));
  }

  async findPage(input: SourceAdFilterInput) {
    const offset = Math.max(0, input.offset ?? 0);
    const limit = Math.min(100, Math.max(1, input.limit ?? 24));
    const search = input.search?.trim();
    const where: Prisma.SourceAdWhereInput = {
      status: input.status,
      competitorId: input.competitorId,
      mediaAsset: input.kind ? { kind: input.kind } : undefined,
      OR: search
        ? [
            { title: { contains: search, mode: 'insensitive' } },
            { adText: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.sourceAd.findMany({ where, include: SOURCE_AD_INCLUDE, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
      this.prisma.sourceAd.count({ where }),
    ]);
    return { items: await Promise.all(items.map((ad) => this.mapSourceAdWithThumbnail(ad))), totalCount };
  }

  async findById(id: string) {
    const ad = await this.prisma.sourceAd.findUnique({ where: { id }, include: SOURCE_AD_INCLUDE });
    if (!ad) throw new NotFoundException('광고를 찾을 수 없습니다');
    return this.mapSourceAd(ad);
  }

  /** 미디어 재다운로드 — 다운로드가 실패했거나 원본을 다시 받아야 할 때. sourceUrl이 있는 광고만. */
  async redownloadMedia(sourceAdId: string) {
    const ad = await this.prisma.sourceAd.findUnique({ where: { id: sourceAdId } });
    if (!ad) throw new NotFoundException('광고를 찾을 수 없습니다');
    if (!ad.sourceUrl) {
      throw new GraphQLError('원본 URL이 없는 광고는 재다운로드할 수 없습니다', {
        extensions: { code: 'NO_SOURCE_URL' },
      });
    }
    const jobId = downloadExternalMediaJobId(ad.id);
    return this.jobRecord.enqueueOrRetry(this.mediaQueue, MEDIA_PROCESSING_QUEUE, JOB_TYPES.DOWNLOAD_EXTERNAL_MEDIA, jobId, {
      sourceAdId: ad.id,
      url: ad.sourceUrl,
      type: 'auto', // kind는 응답 contentType으로 판별된다
    });
  }

  async findSimilar(sourceAdId: string, limit: number) {
    const model = this.embedder.model;
    const vector = await this.vectors.getEmbeddingVector(sourceAdId, model);
    if (!vector) {
      throw new GraphQLError('이 광고의 임베딩이 아직 없습니다 — 분석 완료 후 다시 시도하세요', {
        extensions: { code: 'EMBEDDING_NOT_READY' },
      });
    }
    const hits = await this.vectors.searchSimilar({ vector, model, limit, excludeSourceAdId: sourceAdId });
    const ads = await this.prisma.sourceAd.findMany({
      where: { id: { in: hits.map((hit) => hit.sourceAdId) } },
      include: SOURCE_AD_INCLUDE,
    });
    const byId = new Map(ads.map((ad) => [ad.id, this.mapSourceAd(ad)]));
    return hits
      .filter((hit) => byId.has(hit.sourceAdId))
      .map((hit) => ({ similarity: hit.similarity, sourceAd: byId.get(hit.sourceAdId)! }));
  }
}

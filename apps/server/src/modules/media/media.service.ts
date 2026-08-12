import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import { GraphQLError } from 'graphql';
import { MediaAssetKind, MediaAssetOrigin, User } from '../../../generated/prisma';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../../providers/embedding/embedding.provider';
import { Inject } from '@nestjs/common';
import { VectorSearchRepository } from '../creative-analysis/vector-search.repository';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { JobRecordService } from '../jobs/job-record.service';
import {
  generateThumbnailJobId,
  JOB_TYPES,
  MEDIA_PROCESSING_QUEUE,
  processMediaJobId,
} from '../../queues/queue.constants';
import { CompleteMediaUploadInput, RequestMediaUploadInput } from './media.inputs';

const MEDIA_INCLUDE = {
  ocrResults: true,
  transcriptions: true,
  visualDescriptions: true,
  sourceAds: { select: { id: true, title: true } },
  insights: { orderBy: { createdAt: 'desc' as const } },
} as const;

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobRecord: JobRecordService,
    @InjectQueue(MEDIA_PROCESSING_QUEUE) private readonly queue: Queue,
    @InjectQueue('creative-analysis') private readonly analysisQueue: Queue,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
    private readonly vectors: VectorSearchRepository,
  ) {}

  async requestUpload(user: User, input: RequestMediaUploadInput) {
    const expectedPrefix = input.kind === 'IMAGE' ? 'image/' : 'video/';
    if (!input.contentType.startsWith(expectedPrefix)) {
      throw new GraphQLError(`${input.kind} 업로드의 contentType은 ${expectedPrefix}* 이어야 합니다`, {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const safeName = input.filename.replace(/[^\w.\-가-힣]/g, '_');
    const storageKey = `media/${randomUUID()}/${safeName}`;
    const mediaAsset = await this.prisma.mediaAsset.create({
      data: {
        kind: input.kind,
        originalFilename: input.filename,
        contentType: input.contentType,
        storageKey,
        uploadedById: user.id,
      },
      include: MEDIA_INCLUDE,
    });
    const uploadUrl = await this.storage.presignPut(storageKey, input.contentType);
    return { uploadUrl, mediaAsset };
  }

  async completeUpload(input: CompleteMediaUploadInput) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: input.mediaAssetId } });
    if (!asset) throw new NotFoundException('미디어 자산을 찾을 수 없습니다');

    const head = await this.storage.head(asset.storageKey);
    if (!head) {
      throw new GraphQLError('업로드가 완료되지 않았습니다 — 파일을 먼저 업로드하세요', {
        extensions: { code: 'UPLOAD_NOT_FOUND' },
      });
    }

    const buffer = await this.storage.getBuffer(asset.storageKey);
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const duplicate = await this.prisma.mediaAsset.findFirst({
      where: { contentHash, id: { not: asset.id } },
      orderBy: { createdAt: 'asc' },
    });

    const mediaAsset = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: 'UPLOADED',
        sizeBytes: head.sizeBytes,
        contentHash,
        duplicateOfId: duplicate?.id ?? null,
      },
      include: MEDIA_INCLUDE,
    });

    const jobId = processMediaJobId(asset.id);
    await this.queue.add(
      JOB_TYPES.PROCESS_MEDIA,
      { mediaAssetId: asset.id },
      { jobId, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: false },
    );
    const job = await this.jobRecord.enqueue(jobId, MEDIA_PROCESSING_QUEUE, JOB_TYPES.PROCESS_MEDIA, {
      mediaAssetId: asset.id,
    });

    return { mediaAsset, job };
  }

  async processMediaAsset(mediaAssetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!asset) throw new NotFoundException('미디어 자산을 찾을 수 없습니다');
    if (asset.status === 'PENDING') {
      throw new GraphQLError('업로드 미완료: 파일 업로드를 완료한 뒤 다시 시도하세요', {
        extensions: { code: 'UPLOAD_NOT_COMPLETED' },
      });
    }
    // READY 재처리(결과 추가)와 FAILED 재시도를 허용한다 — 실패한 자산이야말로 재처리 대상이다.
    if (asset.status !== 'UPLOADED' && asset.status !== 'READY' && asset.status !== 'FAILED') {
      throw new GraphQLError(`현재 상태(${asset.status})에서는 미디어 텍스트를 추출할 수 없습니다`, {
        extensions: { code: 'MEDIA_NOT_PROCESSABLE' },
      });
    }

    const payload = { mediaAssetId };
    const jobId = processMediaJobId(mediaAssetId);
    return this.jobRecord.enqueueOrRetry(this.queue, MEDIA_PROCESSING_QUEUE, JOB_TYPES.PROCESS_MEDIA, jobId, payload);
  }

  async analyzeMediaAsset(mediaAssetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId }, include: { ocrResults: true, transcriptions: true, visualDescriptions: true } });
    if (!asset) throw new NotFoundException('미디어 자산을 찾을 수 없습니다');
    if (asset.origin !== 'MANUAL') throw new GraphQLError('광고 미디어는 광고 탭의 분석을 사용하세요', { extensions: { code: 'MEDIA_NOT_MANUAL' } });
    if (![...asset.ocrResults, ...asset.transcriptions, ...asset.visualDescriptions].some((item) => item.text.trim())) {
      throw new GraphQLError('분석할 재료가 없습니다 — 문구 입력 또는 텍스트 추출(비주얼 묘사 포함)이 필요합니다', { extensions: { code: 'TEXT_NOT_EXTRACTED' } });
    }
    const payload = { mediaAssetId };
    const jobId = `analyze-media--${mediaAssetId}`;
    return this.jobRecord.enqueueOrRetry(this.analysisQueue, 'creative-analysis', JOB_TYPES.ANALYZE_MEDIA, jobId, payload);
  }

  async findSimilarAds(mediaAssetId: string, limit: number) {
    const vector = await this.vectors.getMediaEmbeddingVector(mediaAssetId, this.embedder.model);
    if (!vector) throw new GraphQLError('인사이트 분석이 끝나면 검색할 수 있습니다', { extensions: { code: 'MEDIA_EMBEDDING_NOT_READY' } });
    const hits = await this.vectors.searchSimilar({ vector, model: this.embedder.model, limit });
    const ads = await this.prisma.sourceAd.findMany({ where: { id: { in: hits.map((hit) => hit.sourceAdId) } } });
    const byId = new Map(ads.map((ad) => [ad.id, ad]));
    return hits.filter((hit) => byId.has(hit.sourceAdId)).map((hit) => ({ similarity: hit.similarity, sourceAd: byId.get(hit.sourceAdId)! }));
  }

  async generateVideoThumbnails(): Promise<{ enqueued: number }> {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { kind: 'VIDEO', thumbnailKey: null },
      select: { id: true },
    });
    for (const asset of assets) {
      const payload = { mediaAssetId: asset.id };
      await this.jobRecord.enqueueOrRetry(
        this.queue,
        MEDIA_PROCESSING_QUEUE,
        JOB_TYPES.GENERATE_THUMBNAIL,
        generateThumbnailJobId(asset.id),
        payload,
      );
    }
    return { enqueued: assets.length };
  }

  private async mapMediaAsset<T extends { kind: string; storageKey: string; thumbnailKey: string | null; sourceAds: Array<{ id: string; title: string | null }> }>(asset: T) {
    const thumbnailKey = asset.kind === 'IMAGE' ? asset.storageKey : asset.thumbnailKey;
    const insights = 'insights' in asset && Array.isArray(asset.insights)
      ? asset.insights.map((insight: unknown) => insight && typeof insight === 'object'
        ? { ...insight, zhTwJson: (insight as { zhTwFields?: unknown }).zhTwFields ? JSON.stringify((insight as { zhTwFields: unknown }).zhTwFields) : null }
        : insight)
      : [];
    return {
      ...asset,
      insights,
      linkedSourceAds: asset.sourceAds,
      mediaUrl: await this.storage.presignGet(asset.storageKey),
      thumbnailUrl: thumbnailKey ? await this.storage.presignGet(thumbnailKey) : null,
    };
  }

  async findAll(origin?: MediaAssetOrigin) {
    const assets = await this.prisma.mediaAsset.findMany({ where: origin ? { origin } : undefined, include: MEDIA_INCLUDE, orderBy: { createdAt: 'desc' } });
    return Promise.all(assets.map((asset) => this.mapMediaAsset(asset)));
  }

  async findPage(input: { origin?: MediaAssetOrigin; kind?: MediaAssetKind; search?: string; offset: number; limit: number }) {
    const where = {
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.search ? { originalFilename: { contains: input.search, mode: 'insensitive' as const } } : {}),
    };
    const [assets, totalCount] = await this.prisma.$transaction([
      this.prisma.mediaAsset.findMany({ where, include: MEDIA_INCLUDE, orderBy: { createdAt: 'desc' }, skip: input.offset, take: input.limit }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return { totalCount, items: await Promise.all(assets.map((asset) => this.mapMediaAsset(asset))) };
  }

  async findById(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id }, include: MEDIA_INCLUDE });
    if (!asset) throw new NotFoundException('미디어 자산을 찾을 수 없습니다');
    return this.mapMediaAsset(asset);
  }
}

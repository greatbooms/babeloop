import { MediaService } from './media.service';
import {
  generateThumbnailJobId,
  JOB_TYPES,
  MEDIA_PROCESSING_QUEUE,
  processMediaJobId,
} from '../../queues/queue.constants';

// 등록·재시도 분기 자체는 JobRecordService.enqueueOrRetry 스펙이 검증한다 —
// 여기서는 상태 가드와 위임 인자만 확인한다.
describe('MediaService.processMediaAsset', () => {
  function setup(asset: { id: string; status: string } | null) {
    const prisma = { mediaAsset: { findUnique: jest.fn().mockResolvedValue(asset) } };
    const queue = { name: MEDIA_PROCESSING_QUEUE };
    const jobRecord = {
      enqueueOrRetry: jest
        .fn()
        .mockResolvedValue({ id: asset ? processMediaJobId(asset.id) : 'none', status: 'QUEUED' }),
    };
    const service = new MediaService(prisma as never, {} as never, jobRecord as never, queue as never, {} as never, {} as never, {} as never);
    return { service, queue, jobRecord };
  }

  it('PENDING 자산은 업로드 미완료 오류로 거부한다', async () => {
    const { service } = setup({ id: 'asset-1', status: 'PENDING' });
    await expect(service.processMediaAsset('asset-1')).rejects.toThrow('업로드 미완료');
  });

  it('PROCESSING 상태는 재처리를 거부한다', async () => {
    const { service } = setup({ id: 'asset-1', status: 'PROCESSING' });
    await expect(service.processMediaAsset('asset-1')).rejects.toThrow('추출할 수 없습니다');
  });

  it.each(['UPLOADED', 'READY', 'FAILED'] as const)('%s 자산은 enqueueOrRetry로 위임한다', async (status) => {
    const { service, queue, jobRecord } = setup({ id: 'asset-1', status });

    await service.processMediaAsset('asset-1');

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      queue,
      MEDIA_PROCESSING_QUEUE,
      JOB_TYPES.PROCESS_MEDIA,
      processMediaJobId('asset-1'),
      { mediaAssetId: 'asset-1' },
    );
  });
});

describe('MediaService.generateVideoThumbnails', () => {
  it('썸네일이 없는 VIDEO마다 STT와 분리된 GENERATE_THUMBNAIL 잡만 등록한다', async () => {
    const assets = [{ id: 'video-1' }, { id: 'video-2' }];
    const prisma = { mediaAsset: { findMany: jest.fn().mockResolvedValue(assets) } };
    const queue = { name: MEDIA_PROCESSING_QUEUE };
    const jobRecord = { enqueueOrRetry: jest.fn().mockResolvedValue({ status: 'QUEUED' }) };
    const service = new MediaService(prisma as never, {} as never, jobRecord as never, queue as never, {} as never, {} as never, {} as never);

    await expect(service.generateVideoThumbnails()).resolves.toEqual({ enqueued: 2 });
    expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith({
      where: { kind: 'VIDEO', thumbnailKey: null },
      select: { id: true },
    });
    expect(jobRecord.enqueueOrRetry).toHaveBeenNthCalledWith(
      1,
      queue,
      MEDIA_PROCESSING_QUEUE,
      JOB_TYPES.GENERATE_THUMBNAIL,
      generateThumbnailJobId('video-1'),
      { mediaAssetId: 'video-1' },
    );
    expect(JOB_TYPES.GENERATE_THUMBNAIL).not.toBe(JOB_TYPES.PROCESS_MEDIA);
  });
});

describe('MediaService relationships', () => {
  it('자산에 원본·썸네일 URL과 연결 광고를 붙인다', async () => {
    const asset = {
      id: 'media-1',
      kind: 'VIDEO',
      storageKey: 'original',
      thumbnailKey: 'thumbnail',
      ocrResults: [],
      transcriptions: [],
      sourceAds: [{ id: 'ad-1', title: '광고 하나' }],
    };
    const prisma = { mediaAsset: { findMany: jest.fn().mockResolvedValue([asset]) } };
    const storage = { presignGet: jest.fn(async (key: string) => `signed:${key}`) };
    const service = new MediaService(prisma as never, storage as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({
        linkedSourceAds: [{ id: 'ad-1', title: '광고 하나' }],
        mediaUrl: 'signed:original',
        thumbnailUrl: 'signed:thumbnail',
      }),
    ]);
  });

  it('번체중문 인사이트 필드를 nullable GraphQL JSON 문자열로 매핑한다', async () => {
    const zhTwFields = { summary: '繁中摘要', hookType: '提問型', targetAudience: ['成人'], emotionalTriggers: ['好奇'], genres: ['戀愛'] };
    const asset = { id: 'media-2', kind: 'IMAGE', storageKey: 'original', thumbnailKey: null, ocrResults: [], transcriptions: [], sourceAds: [], insights: [{ id: 'insight-1', zhTwFields }] };
    const prisma = { mediaAsset: { findMany: jest.fn().mockResolvedValue([asset]) } };
    const storage = { presignGet: jest.fn(async (key: string) => `signed:${key}`) };
    const service = new MediaService(prisma as never, storage as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    const [mapped] = await service.findAll();

    expect(mapped.insights[0]).toEqual(expect.objectContaining({ zhTwJson: JSON.stringify(zhTwFields) }));
  });
});

describe('MediaService.analyzeMediaAsset', () => {
  function serviceFor(asset: unknown) {
    const prisma = { mediaAsset: { findUnique: jest.fn().mockResolvedValue(asset) } };
    return new MediaService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  }
  it('텍스트가 없으면 TEXT_NOT_EXTRACTED로 거부한다', async () => {
    await expect(serviceFor({ id: 'm1', origin: 'MANUAL', ocrResults: [], transcriptions: [] }).analyzeMediaAsset('m1')).rejects.toMatchObject({ extensions: { code: 'TEXT_NOT_EXTRACTED' } });
  });
  it('AD_IMPORT 자산은 MEDIA_NOT_MANUAL로 거부한다', async () => {
    await expect(serviceFor({ id: 'm1', origin: 'AD_IMPORT', ocrResults: [{ text: 'x' }], transcriptions: [] }).analyzeMediaAsset('m1')).rejects.toMatchObject({ extensions: { code: 'MEDIA_NOT_MANUAL' } });
  });
});

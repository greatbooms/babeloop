import { SourceAdService } from './source-ad.service';

describe('SourceAdService relationships', () => {
  it('페이지 광고에 원본 URL과 참조 브리프를 한 번의 브리프 조회로 붙인다', async () => {
    const ad = {
      id: 'ad-1',
      analyses: [],
      mediaAsset: {
        id: 'media-1',
        kind: 'VIDEO',
        status: 'UPLOADED',
        storageKey: 'original',
        thumbnailKey: 'thumbnail',
      },
    };
    const prisma = {
      sourceAd: { findMany: jest.fn(), count: jest.fn() },
      briefReference: {
        findMany: jest.fn().mockResolvedValue([
          { sourceAdId: 'ad-1', brief: { id: 'brief-1', title: '브리프 하나' } },
        ]),
      },
      $transaction: jest.fn().mockResolvedValue([[ad], 1]),
    };
    const storage = { presignGet: jest.fn(async (key: string) => `signed:${key}`) };
    const service = new SourceAdService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storage as never,
    );

    const page = await service.findPage({} as never);

    expect(page.items[0]).toEqual(expect.objectContaining({
      referencingBriefs: [{ id: 'brief-1', title: '브리프 하나' }],
      mediaAsset: expect.objectContaining({
        thumbnailUrl: 'signed:thumbnail',
        mediaUrl: 'signed:original',
      }),
    }));
    expect(prisma.briefReference.findMany).toHaveBeenCalledTimes(1);
  });

  it('번체중문 분석 필드를 nullable GraphQL JSON 문자열로 매핑한다', async () => {
    const zhTwFields = { summary: '繁中摘要', hookType: '提問型', targetAudience: ['成人'], emotionalTriggers: ['好奇'], genres: ['戀愛'] };
    const ad = { id: 'ad-2', analyses: [{ id: 'analysis-1', zhTwFields }], mediaAsset: null };
    const prisma = {
      sourceAd: { findMany: jest.fn(), count: jest.fn() },
      briefReference: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockResolvedValue([[ad], 1]),
    };
    const service = new SourceAdService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    const page = await service.findPage({} as never);

    expect(page.items[0].latestAnalysis).toEqual(expect.objectContaining({ zhTwJson: JSON.stringify(zhTwFields) }));
  });
});

describe('SourceAdService.analyze 텍스트 가드', () => {
  function serviceWith(ad: unknown) {
    const prisma = { sourceAd: { findUnique: jest.fn().mockResolvedValue(ad) } };
    const jobRecord = { enqueueOrRetry: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const service = new SourceAdService(
      prisma as never,
      jobRecord as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, jobRecord };
  }

  it('adText도 OCR·전사도 없으면 잡을 태우지 않고 TEXT_NOT_EXTRACTED로 거절한다', async () => {
    const { service, jobRecord } = serviceWith({
      adText: null,
      mediaAsset: { _count: { ocrResults: 0, transcriptions: 0 } },
    });
    await expect(service.analyze('ad-1')).rejects.toMatchObject({
      extensions: { code: 'TEXT_NOT_EXTRACTED' },
    });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('OCR 결과가 있으면 enqueueOrRetry 경로로 분석을 등록한다 (실패 잡 재시도 포함)', async () => {
    const { service, jobRecord } = serviceWith({
      adText: null,
      mediaAsset: { _count: { ocrResults: 1, transcriptions: 0 } },
    });
    await expect(service.analyze('ad-1')).resolves.toEqual({ id: 'job-1' });
    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledTimes(1);
  });
});

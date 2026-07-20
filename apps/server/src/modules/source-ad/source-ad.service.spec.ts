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
      creativeBrief: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'brief-1', title: '브리프 하나', sourceAdIds: ['ad-1'] },
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
    expect(prisma.creativeBrief.findMany).toHaveBeenCalledTimes(1);
  });
});

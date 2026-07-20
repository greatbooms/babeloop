import { BriefService } from './brief.service';

describe('BriefService relationships', () => {
  it('sourceAdIds를 referencedAds의 id와 title로 매핑한다', async () => {
    const brief = { id: 'brief-1', sourceAdIds: ['ad-1'], creatives: [] };
    const prisma = {
      creativeBrief: { findMany: jest.fn().mockResolvedValue([brief]) },
      sourceAd: { findMany: jest.fn().mockResolvedValue([{ id: 'ad-1', title: '광고 하나' }]) },
    };
    const service = new BriefService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({ referencedAds: [{ id: 'ad-1', title: '광고 하나' }] }),
    ]);
  });
});

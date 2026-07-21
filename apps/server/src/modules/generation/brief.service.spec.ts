import { BriefService } from './brief.service';

describe('BriefService relationships', () => {
  it('삭제된 광고는 titleSnapshot과 deleted를 매핑한다', async () => {
    const brief = { id: 'brief-1', raw: {}, sourceAdIds: ['ad-1'], references: [{ sourceAdId: null, titleSnapshot: '광고 하나', method: 'UNKNOWN', similarity: null, sourceAd: null }], creatives: [] };
    const prisma = {
      creativeBrief: { findMany: jest.fn().mockResolvedValue([brief]) },
    };
    const service = new BriefService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({ references: [expect.objectContaining({ title: '광고 하나', deleted: true })] }),
    ]);
  });
});

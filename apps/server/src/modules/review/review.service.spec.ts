import { ReviewService } from './review.service';

describe('ReviewService brief images', () => {
  it('검토 상세에서 브리프 이미지의 presigned URL을 노출한다', async () => {
    const creative = {
      id: 'creative-1',
      brief: {
        title: '브리프',
        locale: 'zh-TW',
        images: [
          {
            id: 'image-1',
            storageKey: 'generated-images/brief-1/image.png',
            quality: 'low',
            instructions: '분홍색 조명',
            createdAt: new Date('2026-07-30T00:00:00.000Z'),
            costEstimateUsd: 0.04,
          },
        ],
      },
      scenes: null,
      localizations: [],
      policyChecks: [],
      reviewEvents: [],
      experimentVariants: [],
    };
    const prisma = {
      generatedCreative: { findUnique: jest.fn().mockResolvedValue(creative) },
    };
    const storage = {
      presignGet: jest.fn().mockResolvedValue('signed:image'),
    };
    const service = new ReviewService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      storage as never,
    );

    await expect(service.findById('creative-1')).resolves.toMatchObject({
      briefImages: [
        {
          id: 'image-1',
          url: 'signed:image',
          quality: 'low',
          instructions: '분홍색 조명',
          costEstimateUsd: 0.04,
        },
      ],
    });
    expect(storage.presignGet).toHaveBeenCalledWith(
      'generated-images/brief-1/image.png',
    );
  });
});

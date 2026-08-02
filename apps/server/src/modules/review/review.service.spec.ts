import { ReviewService } from './review.service';

describe('ReviewService visual assets', () => {
  it('검토 상세에서 브리프·문구 이미지와 영상의 presigned URL을 노출한다', async () => {
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
      images: [
        {
          id: 'image-copy-1',
          storageKey: 'generated-images/brief-1/copy.png',
          quality: 'high',
          instructions: '확정 문구 전용',
          createdAt: new Date('2026-08-02T00:00:00.000Z'),
          costEstimateUsd: 0.19,
        },
      ],
      videos: [
        {
          id: 'video-1',
          storageKey: 'generated-videos/creative-1/video.mp4',
          seconds: 12,
          size: '720x1280',
          createdAt: new Date('2026-08-02T00:00:00.000Z'),
          costEstimateUsd: { toNumber: () => 1.2 },
        },
      ],
      localizations: [],
      policyChecks: [],
      reviewEvents: [],
      experimentVariants: [],
    };
    const prisma = {
      generatedCreative: { findUnique: jest.fn().mockResolvedValue(creative) },
    };
    const storage = {
      presignGet: jest.fn(async (key: string) => {
        if (key.endsWith('copy.png')) return 'signed:copy-image';
        if (key.endsWith('video.mp4')) return 'signed:video';
        return 'signed:image';
      }),
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
      images: [
        {
          id: 'image-copy-1',
          url: 'signed:copy-image',
          quality: 'high',
          instructions: '확정 문구 전용',
          costEstimateUsd: 0.19,
        },
      ],
      videos: [
        {
          id: 'video-1',
          url: 'signed:video',
          seconds: 12,
          size: '720x1280',
          costEstimateUsd: 1.2,
        },
      ],
    });
    expect(storage.presignGet).toHaveBeenCalledWith('generated-images/brief-1/image.png');
    expect(storage.presignGet).toHaveBeenCalledWith('generated-images/brief-1/copy.png');
    expect(storage.presignGet).toHaveBeenCalledWith('generated-videos/creative-1/video.mp4');
  });
});

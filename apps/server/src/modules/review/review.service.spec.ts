import { ReviewService } from './review.service';

describe('ReviewService visual assets', () => {
  it('검토 상세에서 문구 전용 이미지와 영상의 presigned URL을 노출한다', async () => {
    const creative = {
      id: 'creative-1',
      brief: {
        title: '브리프',
        locale: 'zh-TW',
        references: [
          {
            sourceAdId: 'ad-image-1',
            sourceAd: {
              id: 'ad-image-1',
              title: '참고 광고',
              mediaAsset: {
                kind: 'IMAGE',
                storageKey: 'source-ads/ad-image-1/original.png',
                thumbnailKey: null,
              },
            },
          },
          {
            sourceAdId: 'ad-video-no-thumbnail',
            sourceAd: {
              id: 'ad-video-no-thumbnail',
              title: '썸네일 없는 영상',
              mediaAsset: {
                kind: 'VIDEO',
                storageKey: 'source-ads/ad-video-no-thumbnail/original.mp4',
                thumbnailKey: null,
              },
            },
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
          prompt: '이미지 프롬프트',
          sizePreset: 'landscape_1200x628',
          referenceKeys: ['generated-images/reference.png'],
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
          prompt: '영상 프롬프트',
          instructions: null,
          referenceKeys: ['generated-images/first-frame.png'],
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
        if (key.includes('ad-image-1')) return 'signed:reference-ad';
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
      images: [
        {
          id: 'image-copy-1',
          url: 'signed:copy-image',
          quality: 'high',
          instructions: '확정 문구 전용',
          sizePreset: 'landscape_1200x628',
          referenceKeys: ['generated-images/reference.png'],
          costEstimateUsd: 0.19,
        },
      ],
      videos: [
        {
          id: 'video-1',
          url: 'signed:video',
          seconds: 12,
          size: '720x1280',
          referenceKeys: ['generated-images/first-frame.png'],
          costEstimateUsd: 1.2,
        },
      ],
      briefReferenceAds: [
        {
          sourceAdId: 'ad-image-1',
          title: '참고 광고',
          thumbnailUrl: 'signed:reference-ad',
        },
      ],
    });
    expect(storage.presignGet).toHaveBeenCalledWith('generated-images/brief-1/copy.png');
    expect(storage.presignGet).toHaveBeenCalledWith('generated-videos/creative-1/video.mp4');
    expect(storage.presignGet).toHaveBeenCalledWith('source-ads/ad-image-1/original.png');
  });
});

import { BriefService } from './brief.service';
import { GenerationReferenceKind } from './brief.inputs';

describe('BriefService relationships', () => {
  it('삭제된 광고는 titleSnapshot과 deleted를 매핑한다', async () => {
    const brief = { id: 'brief-1', raw: {}, sourceAdIds: ['ad-1'], references: [{ sourceAdId: null, titleSnapshot: '광고 하나', method: 'UNKNOWN', similarity: null, sourceAd: null }], creatives: [] };
    const prisma = {
      creativeBrief: { findMany: jest.fn().mockResolvedValue([brief]) },
    };
    const service = new BriefService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({ references: [expect.objectContaining({ title: '광고 하나', deleted: true })] }),
    ]);
  });
});

describe('BriefService.requestCreativeImages 검증', () => {
  function setup() {
    const prisma = {
      generatedCreative: {
        findUnique: jest.fn().mockResolvedValue({ id: 'creative-copy-1', briefId: 'brief-1', type: 'COPY', status: 'APPROVED' }),
      },
    };
    const queue = { name: 'creative-generation' };
    const jobRecord = {
      enqueueOrRetry: jest.fn().mockResolvedValue({ id: 'queued-job' }),
    };
    const service = new BriefService(
      prisma as never,
      jobRecord as never,
      {} as never,
      queue as never,
      {} as never,
    );
    return { service, jobRecord };
  }

  it.each([0, 5])('장수가 %i이면 BAD_USER_INPUT으로 거부한다', async (count) => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestCreativeImages({ creativeId: 'creative-copy-1', instructions: '', count, quality: 'low' }),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('low/high 외 품질은 BAD_USER_INPUT으로 거부한다', async () => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestCreativeImages({
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 2,
        quality: 'ultra',
      }),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('모르는 이미지 규격은 BAD_USER_INPUT으로 거부한다', async () => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestCreativeImages({
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 2,
        quality: 'low',
        sizePreset: 'unknown_size',
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/unknown_size.*square_1200x1200/),
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('참고 이미지가 16장을 초과하면 BAD_USER_INPUT으로 거부한다', async () => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestCreativeImages({
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 1,
        quality: 'low',
        references: Array.from({ length: 17 }, (_, index) => ({
          kind: GenerationReferenceKind.GENERATED_IMAGE,
          id: `image-${index}`,
        })),
      }),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('메인 문구 없이 서브 문구만 있으면 BAD_USER_INPUT으로 거부한다', async () => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestCreativeImages({
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 1,
        quality: 'low',
        overlayHeadline: '   ',
        overlaySubline: '서브 문구',
      } as never),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it.each(['overlayHeadline', 'overlaySubline'] as const)(
    '%s이 60자를 넘으면 BAD_USER_INPUT으로 거부한다',
    async (field) => {
      const { service, jobRecord } = setup();

      await expect(
        service.requestCreativeImages({
          creativeId: 'creative-copy-1',
          instructions: '',
          count: 1,
          quality: 'low',
          overlayHeadline: field === 'overlayHeadline' ? '문'.repeat(61) : '메인',
          overlaySubline: field === 'overlaySubline' ? '문'.repeat(61) : undefined,
        } as never),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
      expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
    },
  );

  it('존재하지 않는 참고 항목은 해당 종류와 ID를 명시해 거부한다', async () => {
    const prisma = {
      generatedCreative: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'creative-copy-1',
          briefId: 'brief-1',
          type: 'COPY',
          status: 'APPROVED',
        }),
      },
      generatedImage: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const jobRecord = { enqueueOrRetry: jest.fn() };
    const service = new BriefService(
      prisma as never,
      jobRecord as never,
      {} as never,
      { name: 'creative-generation' } as never,
      {} as never,
    );

    await expect(
      service.requestCreativeImages({
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 1,
        quality: 'low',
        references: [
          { kind: GenerationReferenceKind.GENERATED_IMAGE, id: 'missing-image' },
        ],
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/GENERATED_IMAGE.*missing-image/),
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });
});

describe('BriefService approved creative generation', () => {
  function setup(creative: { id: string; briefId: string; type: string; status: string }) {
    const prisma = {
      generatedCreative: { findUnique: jest.fn().mockResolvedValue(creative) },
    };
    const queue = { name: 'creative-generation' };
    const jobRecord = {
      enqueueOrRetry: jest.fn().mockResolvedValue({ id: 'queued-job' }),
    };
    const service = new BriefService(
      prisma as never,
      jobRecord as never,
      {} as never,
      queue as never,
      {} as never,
    );
    return { service, queue, jobRecord };
  }

  it('APPROVED COPY의 전용 이미지 잡을 creativeId 포함 payload로 등록한다', async () => {
    const { service, queue, jobRecord } = setup({
      id: 'creative-copy-1',
      briefId: 'brief-1',
      type: 'COPY',
      status: 'APPROVED',
    });

    await expect(service.requestCreativeImages({
      creativeId: 'creative-copy-1',
      instructions: '따뜻한 조명',
      count: 2,
      quality: 'high',
      overlayHeadline: '  메인 문구  ',
      overlaySubline: '  서브 문구  ',
    } as never)).resolves.toEqual({ id: 'queued-job' });

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      queue,
      'creative-generation',
      'generate-images',
      expect.stringMatching(/^generate-images--creative-copy-1--[0-9a-f-]+$/),
      {
        briefId: 'brief-1',
        creativeId: 'creative-copy-1',
        instructions: '따뜻한 조명',
        count: 2,
        quality: 'high',
        sizePreset: 'square_1200x1200',
        referenceKeys: [],
        overlayHeadline: '메인 문구',
        overlaySubline: '서브 문구',
      },
      { attempts: 1 },
    );
  });

  it('세 종류의 참고 항목을 입력 순서대로 storage key로 해석한다', async () => {
    const prisma = {
      generatedCreative: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'creative-copy-1',
          briefId: 'brief-1',
          type: 'COPY',
          status: 'APPROVED',
        }),
      },
      generatedImage: {
        findUnique: jest.fn().mockResolvedValue({ storageKey: 'generated-images/brief-1/ref.png' }),
      },
      sourceAd: {
        findUnique: jest.fn().mockResolvedValue({
          mediaAsset: {
            kind: 'VIDEO',
            storageKey: 'source-ads/ad-1/original.mp4',
            thumbnailKey: 'source-ads/ad-1/thumb.jpg',
          },
        }),
      },
      mediaAsset: {
        findUnique: jest.fn().mockResolvedValue({
          kind: 'IMAGE',
          storageKey: 'media/asset-1/original.webp',
          thumbnailKey: null,
        }),
      },
    };
    const queue = { name: 'creative-generation' };
    const jobRecord = {
      enqueueOrRetry: jest.fn().mockResolvedValue({ id: 'queued-job' }),
    };
    const service = new BriefService(
      prisma as never,
      jobRecord as never,
      {} as never,
      queue as never,
      {} as never,
    );

    await service.requestCreativeImages({
      creativeId: 'creative-copy-1',
      instructions: '',
      count: 1,
      quality: 'low',
      references: [
        { kind: GenerationReferenceKind.MEDIA_ASSET, id: 'asset-1' },
        { kind: GenerationReferenceKind.SOURCE_AD, id: 'ad-1' },
        { kind: GenerationReferenceKind.GENERATED_IMAGE, id: 'image-1' },
      ],
    });

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      queue,
      'creative-generation',
      'generate-images',
      expect.any(String),
      expect.objectContaining({
        referenceKeys: [
          'media/asset-1/original.webp',
          'source-ads/ad-1/thumb.jpg',
          'generated-images/brief-1/ref.png',
        ],
      }),
      { attempts: 1 },
    );
  });

  it('APPROVED COPY가 아니면 전용 이미지 생성을 거부한다', async () => {
    const { service, jobRecord } = setup({
      id: 'creative-video-1',
      briefId: 'brief-1',
      type: 'VIDEO_SCRIPT',
      status: 'APPROVED',
    });

    await expect(service.requestCreativeImages({
      creativeId: 'creative-video-1',
      instructions: '',
      count: 2,
      quality: 'low',
    })).rejects.toThrow('APPROVED 문구에서만 생성할 수 있습니다');
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('APPROVED VIDEO_SCRIPT의 영상 잡을 enqueueOrRetry로 등록한다', async () => {
    const { service, queue, jobRecord } = setup({
      id: 'creative-video-1',
      briefId: 'brief-1',
      type: 'VIDEO_SCRIPT',
      status: 'APPROVED',
    });

    await expect(service.requestCreativeVideo({
      creativeId: 'creative-video-1',
      seconds: 12,
      instructions: '영화적인 조명',
    })).resolves.toEqual({ id: 'queued-job' });

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      queue,
      'creative-generation',
      'generate-video',
      expect.stringMatching(/^generate-video--creative-video-1--[0-9a-f-]+$/),
      {
        creativeId: 'creative-video-1',
        seconds: 12,
        instructions: '영화적인 조명',
        referenceKey: null,
      },
      { attempts: 1 },
    );
  });

  it('영상 첫 프레임 GeneratedImage를 referenceKey로 등록한다', async () => {
    const prisma = {
      generatedCreative: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'creative-video-1',
          briefId: 'brief-1',
          type: 'VIDEO_SCRIPT',
          status: 'APPROVED',
        }),
      },
      generatedImage: {
        findUnique: jest.fn().mockResolvedValue({
          briefId: 'brief-1',
          storageKey: 'generated-images/brief-1/first.jpg',
        }),
      },
    };
    const queue = { name: 'creative-generation' };
    const jobRecord = {
      enqueueOrRetry: jest.fn().mockResolvedValue({ id: 'queued-job' }),
    };
    const service = new BriefService(
      prisma as never,
      jobRecord as never,
      {} as never,
      queue as never,
      {} as never,
    );

    await service.requestCreativeVideo({
      creativeId: 'creative-video-1',
      seconds: 8,
      instructions: '',
      referenceImageId: 'image-first',
    });

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      queue,
      'creative-generation',
      'generate-video',
      expect.any(String),
      expect.objectContaining({ referenceKey: 'generated-images/brief-1/first.jpg' }),
      { attempts: 1 },
    );
  });

  it('다른 브리프의 GeneratedImage는 영상 첫 프레임으로 거부한다', async () => {
    const prisma = {
      generatedCreative: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'creative-video-1',
          briefId: 'brief-1',
          type: 'VIDEO_SCRIPT',
          status: 'APPROVED',
        }),
      },
      generatedImage: {
        findUnique: jest.fn().mockResolvedValue({
          briefId: 'brief-other',
          storageKey: 'generated-images/brief-other/first.jpg',
        }),
      },
    };
    const jobRecord = { enqueueOrRetry: jest.fn() };
    const service = new BriefService(
      prisma as never,
      jobRecord as never,
      {} as never,
      { name: 'creative-generation' } as never,
      {} as never,
    );

    await expect(
      service.requestCreativeVideo({
        creativeId: 'creative-video-1',
        seconds: 8,
        instructions: '',
        referenceImageId: 'image-other',
      }),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('4/8/12초 외 영상 길이를 거부한다', async () => {
    const { service, jobRecord } = setup({
      id: 'creative-video-1',
      briefId: 'brief-1',
      type: 'VIDEO_SCRIPT',
      status: 'APPROVED',
    });

    await expect(service.requestCreativeVideo({
      creativeId: 'creative-video-1',
      seconds: 6,
      instructions: '',
    })).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });
});

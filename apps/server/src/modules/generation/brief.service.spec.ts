import { BriefService } from './brief.service';
import { CharacterCompositePosition, GenerationReferenceKind, GenerationReferenceRole } from './brief.inputs';

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
      generatedImage: {
        findUnique: jest.fn().mockResolvedValue({ briefId: 'brief-1', storageKey: 'generated-images/brief-1/ref.png' }),
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

  it('빈 다중 역할 배열은 BAD_USER_INPUT으로 거부한다', async () => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestCreativeImages({
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 1,
        quality: 'low',
        references: [
          {
            kind: GenerationReferenceKind.GENERATED_IMAGE,
            id: 'image-1',
            roles: [],
          },
        ],
      } as never),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('캐릭터 합성 요청에 CHARACTER 역할 참조가 없으면 BAD_USER_INPUT으로 거부한다', async () => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestCreativeImages({
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 1,
        quality: 'low',
        references: [{ kind: GenerationReferenceKind.GENERATED_IMAGE, id: 'style-1', role: GenerationReferenceRole.STYLE }],
        characterComposite: { position: 'RIGHT', heightRatio: 0.9 },
      } as never),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it.each([
    [GenerationReferenceKind.MEDIA_ASSET, 'video-media-1'],
    [GenerationReferenceKind.SOURCE_AD, 'video-source-ad-1'],
  ])('비디오 %s 캐릭터 참조는 썸네일의 image MIME을 합성 잡에 전달한다', async (kind, id) => {
    const videoAsset = {
      id: 'video-media-1',
      kind: 'VIDEO',
      storageKey: 'media/video-media-1/original.mp4',
      thumbnailKey: 'media/video-media-1/thumbnail.jpg',
      contentType: 'video/mp4',
    };
    const prisma = {
      generatedCreative: {
        findUnique: jest.fn().mockResolvedValue({ id: 'creative-copy-1', briefId: 'brief-1', type: 'COPY', status: 'APPROVED' }),
      },
      mediaAsset: { findUnique: jest.fn().mockResolvedValue(videoAsset) },
      sourceAd: { findUnique: jest.fn().mockResolvedValue({ mediaAsset: videoAsset }) },
    };
    const jobRecord = { enqueueOrRetry: jest.fn().mockResolvedValue({ id: 'queued-job' }) };
    const service = new BriefService(prisma as never, jobRecord as never, {} as never, { name: 'creative-generation' } as never, {} as never);

    await service.requestCreativeImages({
      creativeId: 'creative-copy-1',
      instructions: '',
      count: 1,
      quality: 'low',
      references: [{ kind, id, role: GenerationReferenceRole.CHARACTER }],
      characterComposite: { position: CharacterCompositePosition.RIGHT, heightRatio: 0.9 },
    });

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        characterComposite: expect.objectContaining({
          sourceKey: 'video-media-1',
          storageKey: 'media/video-media-1/thumbnail.jpg',
          sourceContentType: 'image/jpeg',
        }),
      }),
      { attempts: 1 },
    );
  });

  it('참고 이미지 없이 AI 타이포의 match_reference 스타일을 선택하면 거부한다', async () => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestCreativeImages({
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 1,
        quality: 'low',
        overlayHeadline: '主標題',
        overlayMode: 'AI',
        overlayFont: 'serif',
        overlayColor: 'gold',
        aiTypoStyle: 'match_reference',
      } as never),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('TYPOGRAPHY 역할 참고 없이 AI 타이포의 match_reference 스타일을 선택하면 거부한다', async () => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestCreativeImages({
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 1,
        quality: 'low',
        overlayHeadline: '主標題',
        overlayMode: 'AI',
        overlayFont: 'serif',
        overlayColor: 'gold',
        aiTypoStyle: 'match_reference',
        references: [
          {
            kind: GenerationReferenceKind.GENERATED_IMAGE,
            id: 'image-1',
            role: GenerationReferenceRole.STYLE,
          },
        ],
      } as never),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it.each([
    { overlayMode: 'PAINT' },
    { overlayFont: 'comic' },
    { overlayColor: 'blue' },
    { overlayColor: '#fff' },
    { overlayMode: 'AI', aiTypoStyle: 'wild' },
  ])('허용되지 않은 오버레이 옵션 $overlayMode$overlayFont$overlayColor$aiTypoStyle 을 거부한다', async (invalidOption) => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestCreativeImages({
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 1,
        quality: 'low',
        overlayHeadline: '主標題',
        ...invalidOption,
      } as never),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('6자리 hex 색상을 이미지 잡 payload에 그대로 전달한다', async () => {
    const { service, jobRecord } = setup();

    await service.requestCreativeImages({
      creativeId: 'creative-copy-1',
      instructions: '',
      count: 1,
      quality: 'low',
      overlayHeadline: '主標題',
      overlayColor: '#12AbEF',
    } as never);

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ overlayColor: '#12AbEF' }),
      expect.anything(),
    );
  });

  it('메인 문구 없이 기본값이 아닌 오버레이 옵션을 선택하면 거부한다', async () => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestCreativeImages({
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 1,
        quality: 'low',
        overlayFont: 'serif',
      } as never),
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
        copyInfluence: 'SCENE',
        overlayHeadline: '메인 문구',
        overlaySubline: '서브 문구',
        overlayMode: 'SERVER',
        overlayFont: 'gothic',
        overlayColor: 'white',
      },
      { attempts: 1 },
    );
  });

  it('TEXT_ONLY 문구 반영 방식을 이미지 잡 payload로 전달한다', async () => {
    const { service, jobRecord } = setup({
      id: 'creative-copy-1',
      briefId: 'brief-1',
      type: 'COPY',
      status: 'APPROVED',
    });

    await service.requestCreativeImages({
      creativeId: 'creative-copy-1',
      instructions: '',
      count: 1,
      quality: 'low',
      copyInfluence: 'TEXT_ONLY',
    } as never);

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ copyInfluence: 'TEXT_ONLY' }),
      { attempts: 1 },
    );
  });

  it('세 종류의 참고 항목을 역할 순서대로 storage key와 role로 해석한다', async () => {
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
        {
          kind: GenerationReferenceKind.MEDIA_ASSET,
          id: 'asset-1',
          role: GenerationReferenceRole.TYPOGRAPHY,
        },
        {
          kind: GenerationReferenceKind.SOURCE_AD,
          id: 'ad-1',
          role: GenerationReferenceRole.STYLE,
        },
        {
          kind: GenerationReferenceKind.GENERATED_IMAGE,
          id: 'image-1',
          role: GenerationReferenceRole.CHARACTER,
        },
      ],
    });

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      queue,
      'creative-generation',
      'generate-images',
      expect.any(String),
      expect.objectContaining({
        referenceKeys: [
          'generated-images/brief-1/ref.png',
          'source-ads/ad-1/thumb.jpg',
          'media/asset-1/original.webp',
        ],
        references: [
          { key: 'generated-images/brief-1/ref.png', roles: ['CHARACTER'] },
          { key: 'source-ads/ad-1/thumb.jpg', roles: ['STYLE'] },
          { key: 'media/asset-1/original.webp', roles: ['TYPOGRAPHY'] },
        ],
      }),
      { attempts: 1 },
    );
  });

  it('다중 역할의 최우선 역할에 따라 CHARACTER, STYLE, TYPOGRAPHY 순으로 참고 항목을 정렬한다', async () => {
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
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
          briefId: 'brief-1',
          storageKey: `generated-images/${where.id}.png`,
        })),
      },
    };
    const jobRecord = { enqueueOrRetry: jest.fn().mockResolvedValue({ id: 'queued-job' }) };
    const service = new BriefService(
      prisma as never,
      jobRecord as never,
      {} as never,
      { name: 'creative-generation' } as never,
      {} as never,
    );

    await service.requestCreativeImages({
      creativeId: 'creative-copy-1',
      instructions: '',
      count: 1,
      quality: 'low',
      references: [
        { kind: GenerationReferenceKind.GENERATED_IMAGE, id: 'typography', roles: [GenerationReferenceRole.TYPOGRAPHY] },
        { kind: GenerationReferenceKind.GENERATED_IMAGE, id: 'style', roles: [GenerationReferenceRole.STYLE] },
        { kind: GenerationReferenceKind.GENERATED_IMAGE, id: 'character', roles: [GenerationReferenceRole.STYLE, GenerationReferenceRole.CHARACTER] },
      ],
    } as never);

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        references: [
          { key: 'generated-images/character.png', roles: ['CHARACTER', 'STYLE'] },
          { key: 'generated-images/style.png', roles: ['STYLE'] },
          { key: 'generated-images/typography.png', roles: ['TYPOGRAPHY'] },
        ],
      }),
      { attempts: 1 },
    );
  });

  it('참고 역할을 생략하면 STYLE로 해석한다', async () => {
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
        findUnique: jest.fn().mockResolvedValue({
          storageKey: 'generated-images/brief-1/ref.png',
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
        { kind: GenerationReferenceKind.GENERATED_IMAGE, id: 'image-1' } as never,
      ],
    });

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      queue,
      'creative-generation',
      'generate-images',
      expect.any(String),
      expect.objectContaining({
        referenceKeys: ['generated-images/brief-1/ref.png'],
        references: [
          { key: 'generated-images/brief-1/ref.png', roles: ['STYLE'] },
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

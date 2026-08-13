import { CreativeGenerationProcessor } from './creative-generation.processor';
import { JOB_TYPES } from './queue.constants';
import { resizeImageToSpec } from '../common/media/image-resize';
import { computeOverlayLayout, renderTextOverlay } from '../common/media/text-overlay';

jest.mock('../common/media/image-resize', () => ({ resizeImageToSpec: jest.fn() }));
jest.mock('../common/media/text-overlay', () => ({
  computeOverlayLayout: jest.fn(),
  renderTextOverlay: jest.fn(),
}));

const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const OVERLAID_PNG = Buffer.from('overlaid-png');

describe('CreativeGenerationProcessor brand translation', () => {
  it('원문 언어와 무관하게 한국어·번체중문 두 벌을 저장한다 (translate-brand@v2)', async () => {
    const translated = {
      ko: {
        description: '[MOCK 한국어] 소개',
        features: [{ name: '[MOCK 한국어] 기능', description: '[MOCK 한국어] 설명' }],
        guidelines: [{ title: '[MOCK 한국어] 규범', content: '[MOCK 한국어] 내용' }],
      },
      zhTw: {
        description: '[MOCK 繁中] 品牌介紹',
        features: [{ name: '[MOCK 繁中] 功能', description: '[MOCK 繁中] 功能說明' }],
        guidelines: [{ title: '[MOCK 繁中] 規範', content: '[MOCK 繁中] 規範內容' }],
      },
    };
    const prisma = {
      brand: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'brand-1', name: '브랜드', description: '소개', features: [{ name: '기능', description: '설명' }], guidelines: [{ title: '규칙', content: '내용' }] }),
        update: jest.fn(),
      },
    };
    const aiLog = { record: jest.fn(async (_meta, run) => run()) };
    const jobRecord = { markRunning: jest.fn(), markSucceeded: jest.fn(), markFailed: jest.fn() };
    const textAi = { name: 'mock', model: 'mock-text-1', generate: jest.fn().mockResolvedValue({ text: JSON.stringify(translated) }) };
    const processor = new CreativeGenerationProcessor(prisma as never, aiLog as never, jobRecord as never, {} as never, textAi as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    await processor.process({ id: 'translate-brand--brand-1', name: JOB_TYPES.TRANSLATE_BRAND, data: { brandId: 'brand-1' }, attemptsMade: 0, opts: { attempts: 1 } } as never);

    expect(prisma.brand.update).toHaveBeenCalledWith({ where: { id: 'brand-1' }, data: { zhTw: translated.zhTw, koFields: translated.ko, zhTwTranslatedAt: expect.any(Date), updatedAt: expect.any(Date) } });
    const savedTimes = prisma.brand.update.mock.calls[0][0].data;
    expect(savedTimes.updatedAt).toBe(savedTimes.zhTwTranslatedAt);
    expect(aiLog.record).toHaveBeenCalledWith(expect.objectContaining({ promptVersion: 'translate-brand@v2', inputRef: 'brand:brand-1' }), expect.any(Function));
    expect(jobRecord.markSucceeded).toHaveBeenCalledWith('translate-brand--brand-1', { brandId: 'brand-1' });
  });
});

describe('CreativeGenerationProcessor image generation', () => {
  beforeEach(() => {
    jest.mocked(resizeImageToSpec).mockReset().mockResolvedValue(VALID_PNG);
    jest.mocked(computeOverlayLayout).mockReset().mockReturnValue({
      lines: [{ text: '主標題', fontSize: 60, y: 400 }],
    });
    jest.mocked(renderTextOverlay).mockReset().mockResolvedValue(OVERLAID_PNG);
  });

  it('참고 버퍼를 mock 이미지 provider에 전달하고 키와 비용을 저장한다', async () => {
    const png = VALID_PNG;
    const creativeFixture = {
      id: 'creative-copy-1',
      koreanText: '오늘 밤, 내 이야기에 빠져봐',
      localizations: [],
      brief: {
        id: 'brief-1',
        visualFormat: '세로형 캐릭터 클로즈업',
        hookType: '호기심 자극',
        desire: '주인공이 되고 싶은 욕구',
        brand: { name: 'BabeChat' },
      },
    };
    const createdImages = [{ id: 'image-1' }, { id: 'image-2' }];
    const prisma = {
      generatedCreative: { findUniqueOrThrow: jest.fn().mockResolvedValue(creativeFixture) },
      generatedImage: {
        create: jest
          .fn()
          .mockResolvedValueOnce(createdImages[0])
          .mockResolvedValueOnce(createdImages[1]),
      },
    };
    const aiLog = { record: jest.fn(async (_meta, run) => run()) };
    const jobRecord = {
      markRunning: jest.fn(),
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
    };
    const imageProvider = {
      name: 'mock',
      model: 'mock-image-1',
      generate: jest.fn().mockResolvedValue({
        images: [
          { buffer: png, contentType: 'image/png' },
          { buffer: png, contentType: 'image/png' },
        ],
        costEstimateUsd: 0.08,
      }),
    };
    const referenceJpeg = Buffer.from('reference-jpeg');
    const referencePng = Buffer.from('reference-png');
    const storage = {
      getBuffer: jest.fn(async (key: string) =>
        key.endsWith('.jpg') ? referenceJpeg : referencePng,
      ),
      putBuffer: jest.fn(),
    };
    const processor = new CreativeGenerationProcessor(
      prisma as never,
      aiLog as never,
      jobRecord as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storage as never,
      imageProvider as never,
      {} as never,
    );
    const jobId = 'generate-images--brief-1--request-1';

    await processor.process({
      id: jobId,
      name: JOB_TYPES.GENERATE_IMAGES,
      data: {
        briefId: 'brief-1',
        creativeId: 'creative-copy-1',
        instructions: '분홍색 네온 조명, 글자 금지',
        count: 2,
        quality: 'low',
        sizePreset: 'landscape_1200x628',
        referenceKeys: ['generated-images/ref-1.jpg', 'media/ref-2.png'],
      },
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as never);

    expect(imageProvider.generate).toHaveBeenCalledWith({
      prompt: expect.stringMatching(
        /BabeChat[\s\S]*주인공이 되고 싶은 욕구[\s\S]*호기심 자극[\s\S]*세로형 캐릭터 클로즈업[\s\S]*어떤 문자도 그리지 마라[\s\S]*문구는 생성 후 별도 합성된다[\s\S]*분홍색 네온 조명, 글자 금지[\s\S]*## 출력 규격: 1200x628 \(1\.91:1\)[\s\S]*가로형 구도[\s\S]*문구가 나중에 얹힐 단순한 빈 공간[\s\S]*## 참고 이미지: 2장\n- generated-images\/ref-1\.jpg\n- media\/ref-2\.png$/,
      ),
      count: 2,
      quality: 'low',
      size: '1536x1024',
      referenceImages: [
        { buffer: referenceJpeg, contentType: 'image/jpeg' },
        { buffer: referencePng, contentType: 'image/png' },
      ],
    });
    expect(storage.getBuffer).toHaveBeenNthCalledWith(1, 'generated-images/ref-1.jpg');
    expect(storage.getBuffer).toHaveBeenNthCalledWith(2, 'media/ref-2.png');
    expect(storage.putBuffer).toHaveBeenCalledTimes(2);
    expect(resizeImageToSpec).toHaveBeenCalledTimes(2);
    expect(resizeImageToSpec).toHaveBeenCalledWith(png, 1200, 628);
    expect(storage.putBuffer).toHaveBeenCalledWith(
      expect.stringMatching(/^generated-images\/brief-1\/[0-9a-f-]+\.png$/),
      png,
      'image/png',
    );
    expect(prisma.generatedImage.create).toHaveBeenCalledTimes(2);
    expect(prisma.generatedImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        briefId: 'brief-1',
        quality: 'low',
        instructions: '분홍색 네온 조명, 글자 금지',
        provider: 'mock',
        model: 'mock-image-1',
        promptVersion: 'generate-copy-images@v4',
        sizePreset: 'landscape_1200x628',
        referenceKeys: ['generated-images/ref-1.jpg', 'media/ref-2.png'],
        costEstimateUsd: 0.04,
        cleanStorageKey: null,
        overlayHeadline: null,
        overlaySubline: null,
      }),
    });
    expect(renderTextOverlay).not.toHaveBeenCalled();
    expect(aiLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'mock',
        model: 'mock-image-1',
        promptVersion: 'generate-copy-images@v4',
        inputRef: 'creative:creative-copy-1',
        costEstimateUsd: 0.08,
      }),
      expect.any(Function),
    );
    expect(jobRecord.markSucceeded).toHaveBeenCalledWith(jobId, {
      imageIds: ['image-1', 'image-2'],
    });
  });

  it('문구가 있으면 클린본과 합성본을 모두 저장하고 오버레이 필드를 기록한다', async () => {
    const creative = {
      id: 'creative-copy-1',
      koreanText: '한국어 연출 재료',
      localizations: [],
      brief: {
        id: 'brief-1',
        visualFormat: '가로형',
        hookType: '호기심',
        desire: '몰입',
        brand: { name: 'BabeChat' },
      },
    };
    const prisma = {
      generatedCreative: { findUniqueOrThrow: jest.fn().mockResolvedValue(creative) },
      generatedImage: { create: jest.fn().mockResolvedValue({ id: 'image-overlay-1' }) },
    };
    const aiLog = { record: jest.fn(async (_meta, run) => run()) };
    const jobRecord = {
      markRunning: jest.fn(),
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
    };
    const imageProvider = {
      name: 'mock',
      model: 'mock-image-1',
      generate: jest.fn().mockResolvedValue({
        images: [{ buffer: VALID_PNG, contentType: 'image/png' }],
        costEstimateUsd: 0.04,
      }),
    };
    const storage = { getBuffer: jest.fn(), putBuffer: jest.fn() };
    const processor = new CreativeGenerationProcessor(
      prisma as never,
      aiLog as never,
      jobRecord as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storage as never,
      imageProvider as never,
      {} as never,
    );

    await processor.process({
      id: 'generate-images--creative-copy-1--overlay',
      name: JOB_TYPES.GENERATE_IMAGES,
      data: {
        briefId: 'brief-1',
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 1,
        quality: 'low',
        sizePreset: 'landscape_1200x628',
        referenceKeys: [],
        overlayHeadline: '今晚，只屬於你的故事',
        overlaySubline: '立即開始聊天',
      },
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as never);

    expect(computeOverlayLayout).toHaveBeenCalledWith({
      width: 1200,
      height: 628,
      group: 'landscape',
      headline: '今晚，只屬於你的故事',
      subline: '立即開始聊天',
    });
    expect(renderTextOverlay).toHaveBeenCalledWith(VALID_PNG, {
      lines: [{ text: '主標題', fontSize: 60, y: 400 }],
    });
    expect(storage.putBuffer).toHaveBeenCalledTimes(2);
    const cleanKey = storage.putBuffer.mock.calls[0][0] as string;
    const overlayKey = storage.putBuffer.mock.calls[1][0] as string;
    expect(cleanKey).toMatch(/^generated-images\/brief-1\/[0-9a-f-]+-clean\.png$/);
    expect(overlayKey).toBe(cleanKey.replace('-clean.png', '.png'));
    expect(storage.putBuffer).toHaveBeenNthCalledWith(1, cleanKey, VALID_PNG, 'image/png');
    expect(storage.putBuffer).toHaveBeenNthCalledWith(2, overlayKey, OVERLAID_PNG, 'image/png');
    expect(prisma.generatedImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storageKey: overlayKey,
        cleanStorageKey: cleanKey,
        overlayHeadline: '今晚，只屬於你的故事',
        overlaySubline: '立即開始聊天',
      }),
    });
  });

  it('승인 문구 기반 이미지 프롬프트에 한국어와 승인된 zh-TW 문구를 포함한다', async () => {
    const creative = {
      id: 'creative-copy-1',
      type: 'COPY',
      status: 'APPROVED',
      koreanText: '오늘 밤, 내 이야기에 빠져봐',
      localizations: [{ kind: 'APPROVED', locale: 'zh-TW', text: '今晚，沉浸在我的故事裡' }],
      brief: {
        id: 'brief-1',
        audienceHypothesis: '스토리 몰입을 원하는 성인',
        visualFormat: '세로형 캐릭터 클로즈업',
        hookType: '호기심 자극',
        desire: '주인공이 되고 싶은 욕구',
        messageAngle: '나만의 이야기',
        brand: { name: 'BabeChat', description: 'AI 캐릭터챗' },
      },
    };
    const prisma = {
      generatedCreative: { findUniqueOrThrow: jest.fn().mockResolvedValue(creative) },
      generatedImage: { create: jest.fn().mockResolvedValue({ id: 'image-copy-1' }) },
    };
    const aiLog = { record: jest.fn(async (_meta, run) => run()) };
    const jobRecord = { markRunning: jest.fn(), markSucceeded: jest.fn(), markFailed: jest.fn() };
    const imageProvider = {
      name: 'mock',
      model: 'mock-image-1',
      generate: jest.fn().mockResolvedValue({
        images: [{ buffer: VALID_PNG, contentType: 'image/png' }],
        costEstimateUsd: 0.04,
      }),
    };
    const storage = { getBuffer: jest.fn(), putBuffer: jest.fn() };
    const processor = new (CreativeGenerationProcessor as any)(
      prisma,
      aiLog,
      jobRecord,
      {},
      {},
      {},
      {},
      storage,
      imageProvider,
      {},
    );
    const jobId = 'generate-images--creative-copy-1--request-1';

    await processor.process({
      id: jobId,
      name: JOB_TYPES.GENERATE_IMAGES,
      data: {
        briefId: 'brief-1',
        creativeId: 'creative-copy-1',
        instructions: '',
        count: 1,
        quality: 'low',
      },
      attemptsMade: 0,
      opts: { attempts: 1 },
    });

    expect(imageProvider.generate).toHaveBeenCalledWith({
      prompt: expect.stringMatching(
        /## 확정 광고 문구[\s\S]*한국어: 오늘 밤, 내 이야기에 빠져봐[\s\S]*zh-TW\(승인본\): 今晚，沉浸在我的故事裡/,
      ),
      count: 1,
      quality: 'low',
      size: '1024x1024',
    });
    expect(prisma.generatedImage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        briefId: 'brief-1',
        creativeId: 'creative-copy-1',
        promptVersion: 'generate-copy-images@v4',
        sizePreset: 'square_1200x1200',
      }),
    });
  });
});

describe('CreativeGenerationProcessor video generation', () => {
  it('첫 프레임 버퍼를 mock 영상 provider에 전달하고 키와 비용을 저장한다', async () => {
    const video = Buffer.from('mock-video');
    const creative = {
      id: 'creative-video-1',
      type: 'VIDEO_SCRIPT',
      status: 'APPROVED',
      scenes: [
        { seconds: 0, visual: '주인공의 놀란 표정 클로즈업', dialogue: '', caption: '누구지?' },
        { seconds: 3, visual: '채팅 화면을 보는 오버숄더 숏', dialogue: '(VO) 이야기가 시작된다', caption: '' },
      ],
      brief: {
        hookType: '미스터리',
        desire: '나만의 이야기에 몰입하고 싶은 욕구',
        brand: { name: 'BabeChat' },
      },
    };
    const prisma = {
      generatedCreative: { findUniqueOrThrow: jest.fn().mockResolvedValue(creative) },
      generatedVideo: { create: jest.fn().mockResolvedValue({ id: 'video-1' }) },
    };
    const aiLog = { record: jest.fn(async (_meta, run) => run()) };
    const jobRecord = { markRunning: jest.fn(), markSucceeded: jest.fn(), markFailed: jest.fn() };
    const firstFrame = Buffer.from('first-frame-jpeg');
    const storage = { getBuffer: jest.fn().mockResolvedValue(firstFrame), putBuffer: jest.fn() };
    const videoProvider = {
      name: 'mock',
      model: 'mock-video-1',
      generate: jest.fn().mockResolvedValue({
        video: { buffer: video, contentType: 'video/mp4' },
        costEstimateUsd: 1.2,
      }),
    };
    const processor = new (CreativeGenerationProcessor as any)(
      prisma,
      aiLog,
      jobRecord,
      {},
      {},
      {},
      {},
      storage,
      {},
      videoProvider,
    );
    const jobId = 'generate-video--creative-video-1--request-1';

    await processor.process({
      id: jobId,
      name: 'generate-video',
      data: {
        creativeId: 'creative-video-1',
        seconds: 12,
        instructions: '영화적인 조명',
        referenceKey: 'generated-images/brief-1/first.jpeg',
      },
      attemptsMade: 0,
      opts: { attempts: 1 },
    });

    expect(videoProvider.generate).toHaveBeenCalledWith({
      prompt: expect.stringMatching(
        /0-3초: \[연출\] 주인공의 놀란 표정 클로즈업[\s\S]*미스터리[\s\S]*나만의 이야기에 몰입하고 싶은 욕구[\s\S]*세로 9:16 숏폼 광고[\s\S]*영화적인 조명[\s\S]*## 참고 이미지: 1장\n- generated-images\/brief-1\/first\.jpeg$/,
      ),
      seconds: 12,
      size: '720x1280',
      inputReference: { buffer: firstFrame, contentType: 'image/jpeg' },
    });
    expect(storage.getBuffer).toHaveBeenCalledWith('generated-images/brief-1/first.jpeg');
    expect(storage.putBuffer).toHaveBeenCalledWith(
      expect.stringMatching(/^generated-videos\/creative-video-1\/[0-9a-f-]+\.mp4$/),
      video,
      'video/mp4',
    );
    expect(prisma.generatedVideo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creativeId: 'creative-video-1',
        seconds: 12,
        size: '720x1280',
        promptVersion: 'generate-video@v2',
        referenceKeys: ['generated-images/brief-1/first.jpeg'],
        costEstimateUsd: 1.2,
      }),
    });
    expect(aiLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'mock',
        model: 'mock-video-1',
        promptVersion: 'generate-video@v2',
        inputRef: 'creative:creative-video-1',
        costEstimateUsd: 1.2,
      }),
      expect.any(Function),
    );
    expect(jobRecord.markSucceeded).toHaveBeenCalledWith(jobId, { videoId: 'video-1' });
  });
});

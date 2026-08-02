import { CreativeGenerationProcessor } from './creative-generation.processor';
import { JOB_TYPES } from './queue.constants';

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
    const processor = new CreativeGenerationProcessor(prisma as never, aiLog as never, jobRecord as never, {} as never, textAi as never, {} as never, {} as never, {} as never, {} as never);

    await processor.process({ id: 'translate-brand--brand-1', name: JOB_TYPES.TRANSLATE_BRAND, data: { brandId: 'brand-1' }, attemptsMade: 0, opts: { attempts: 1 } } as never);

    expect(prisma.brand.update).toHaveBeenCalledWith({ where: { id: 'brand-1' }, data: { zhTw: translated.zhTw, koFields: translated.ko, zhTwTranslatedAt: expect.any(Date), updatedAt: expect.any(Date) } });
    const savedTimes = prisma.brand.update.mock.calls[0][0].data;
    expect(savedTimes.updatedAt).toBe(savedTimes.zhTwTranslatedAt);
    expect(aiLog.record).toHaveBeenCalledWith(expect.objectContaining({ promptVersion: 'translate-brand@v2', inputRef: 'brand:brand-1' }), expect.any(Function));
    expect(jobRecord.markSucceeded).toHaveBeenCalledWith('translate-brand--brand-1', { brandId: 'brand-1' });
  });
});

describe('CreativeGenerationProcessor image generation', () => {
  it('mock 이미지 N장을 저장하고 비용을 포함해 AI 실행을 기록한다', async () => {
    const png = Buffer.from('mock-png');
    const brief = {
      id: 'brief-1',
      visualFormat: '세로형 캐릭터 클로즈업',
      hookType: '호기심 자극',
      desire: '주인공이 되고 싶은 욕구',
      brand: { name: 'BabeChat' },
    };
    const createdImages = [{ id: 'image-1' }, { id: 'image-2' }];
    const prisma = {
      creativeBrief: { findUniqueOrThrow: jest.fn().mockResolvedValue(brief) },
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
    const storage = { putBuffer: jest.fn() };
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
    );
    const jobId = 'generate-images--brief-1--request-1';

    await processor.process({
      id: jobId,
      name: JOB_TYPES.GENERATE_IMAGES,
      data: {
        briefId: 'brief-1',
        instructions: '분홍색 네온 조명, 글자 금지',
        count: 2,
        quality: 'low',
      },
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as never);

    expect(imageProvider.generate).toHaveBeenCalledWith({
      prompt: expect.stringMatching(
        /BabeChat[\s\S]*주인공이 되고 싶은 욕구[\s\S]*호기심 자극[\s\S]*세로형 캐릭터 클로즈업[\s\S]*텍스트 오버레이 없음[\s\S]*분홍색 네온 조명, 글자 금지/,
      ),
      count: 2,
      quality: 'low',
    });
    expect(storage.putBuffer).toHaveBeenCalledTimes(2);
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
        promptVersion: 'generate-images@v2',
        costEstimateUsd: 0.04,
      }),
    });
    expect(aiLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'mock',
        model: 'mock-image-1',
        promptVersion: 'generate-images@v2',
        inputRef: 'brief:brief-1',
        costEstimateUsd: 0.08,
      }),
      expect.any(Function),
    );
    expect(jobRecord.markSucceeded).toHaveBeenCalledWith(jobId, {
      imageIds: ['image-1', 'image-2'],
    });
  });
});

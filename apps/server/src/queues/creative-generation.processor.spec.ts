import { CreativeGenerationProcessor } from './creative-generation.processor';
import { JOB_TYPES } from './queue.constants';

describe('CreativeGenerationProcessor brand translation', () => {
  it('stores one mock Traditional Chinese translation with translate-brand@v1', async () => {
    const translated = {
      description: '[MOCK 繁中] 品牌介紹',
      features: [{ name: '[MOCK 繁中] 功能', description: '[MOCK 繁中] 功能說明' }],
      guidelines: [{ title: '[MOCK 繁中] 規範', content: '[MOCK 繁中] 規範內容' }],
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
    const processor = new CreativeGenerationProcessor(prisma as never, aiLog as never, jobRecord as never, {} as never, textAi as never, {} as never, {} as never);

    await processor.process({ id: 'translate-brand--brand-1', name: JOB_TYPES.TRANSLATE_BRAND, data: { brandId: 'brand-1' }, attemptsMade: 0, opts: { attempts: 1 } } as never);

    expect(prisma.brand.update).toHaveBeenCalledWith({ where: { id: 'brand-1' }, data: { zhTw: translated, zhTwTranslatedAt: expect.any(Date), updatedAt: expect.any(Date) } });
    const savedTimes = prisma.brand.update.mock.calls[0][0].data;
    expect(savedTimes.updatedAt).toBe(savedTimes.zhTwTranslatedAt);
    expect(aiLog.record).toHaveBeenCalledWith(expect.objectContaining({ promptVersion: 'translate-brand@v1', inputRef: 'brand:brand-1' }), expect.any(Function));
    expect(jobRecord.markSucceeded).toHaveBeenCalledWith('translate-brand--brand-1', { brandId: 'brand-1' });
  });
});

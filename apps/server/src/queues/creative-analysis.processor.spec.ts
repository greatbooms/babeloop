import { CreativeAnalysisProcessor } from './creative-analysis.processor';
import { JOB_TYPES } from './queue.constants';

describe('CreativeAnalysisProcessor media insight', () => {
  it('mock TEXT_AI 결과를 MediaInsight 필드에 저장한다', async () => {
    const prisma = {
      mediaAsset: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'm1', ocrResults: [{ text: '[MOCK OCR] sample' }], transcriptions: [] }) },
      mediaInsight: { create: jest.fn().mockResolvedValue({ id: 'i1' }) },
    };
    const aiLog = { record: jest.fn(async (_meta, run) => run()) };
    const jobRecord = { markRunning: jest.fn(), markSucceeded: jest.fn(), markFailed: jest.fn() };
    const zhTw = { summary: '[MOCK 繁中] 媒體洞察', hookType: '提問型', targetAudience: ['成人'], emotionalTriggers: ['好奇心'], genres: ['戀愛'] };
    const textAi = { name: 'mock', model: 'mock-text-1', generate: jest.fn().mockResolvedValue({ text: JSON.stringify({ summary: '[MOCK 미디어 인사이트] sample', hookType: '질문형', targetAudience: ['성인'], emotionalTriggers: ['호기심'], genres: ['로맨스'], zhTw }) }) };
    const embedder = { name: 'mock', model: 'mock-embedding-1', dimension: 3, embed: jest.fn().mockResolvedValue([1, 0, 0]) };
    const vectors = { upsertMediaEmbedding: jest.fn() };
    const processor = new CreativeAnalysisProcessor(prisma as never, aiLog as never, {} as never, jobRecord as never, textAi as never, embedder as never, vectors as never, {} as never);
    await processor.process({ id: 'analyze-media--m1', name: JOB_TYPES.ANALYZE_MEDIA, data: { mediaAssetId: 'm1' }, attemptsMade: 0, opts: { attempts: 1 } } as never);
    expect(prisma.mediaInsight.create).toHaveBeenCalledWith({ data: expect.objectContaining({ mediaAssetId: 'm1', summary: '[MOCK 미디어 인사이트] sample', hookType: '질문형', targetAudience: ['성인'], zhTwFields: zhTw, promptVersion: 'analyze-media@v2' }) });
  });
});

describe('CreativeAnalysisProcessor bilingual creative analysis', () => {
  it('stores the Traditional Chinese companion fields', async () => {
    const zhTw = { summary: '[MOCK 繁中] 摘要', hookType: '提問型', targetAudience: ['成人'], emotionalTriggers: ['好奇'], genres: ['戀愛'] };
    const prisma = {
      sourceAd: { update: jest.fn() },
      creativeAnalysis: { create: jest.fn() },
    };
    const aiLog = { record: jest.fn(async (_meta, run) => run()) };
    const analysis = { buildInputText: jest.fn().mockResolvedValue('광고 원문') };
    const jobRecord = { markRunning: jest.fn(), markSucceeded: jest.fn(), markFailed: jest.fn(), enqueue: jest.fn() };
    const textAi = { name: 'mock', model: 'mock-text-1', generate: jest.fn().mockResolvedValue({ text: JSON.stringify({ summary: '[MOCK 분석] 광고 원문', hook: { text: '광고 원문', type: '질문형' }, callToAction: { text: '시작', type: '무료 시작' }, targetAudience: ['성인'], emotionalTriggers: ['호기심'], genres: ['로맨스'], language: 'ko', zhTw }) }) };
    const processor = new CreativeAnalysisProcessor(prisma as never, aiLog as never, analysis as never, jobRecord as never, textAi as never, {} as never, {} as never, { add: jest.fn() } as never);

    await processor.process({ id: 'analyze-creative--ad-1', name: JOB_TYPES.ANALYZE_CREATIVE, data: { sourceAdId: 'ad-1' }, attemptsMade: 0, opts: { attempts: 1 } } as never);

    expect(prisma.creativeAnalysis.create).toHaveBeenCalledWith({ data: expect.objectContaining({ zhTwFields: zhTw, promptVersion: 'analyze-creative@v2' }) });
  });
});

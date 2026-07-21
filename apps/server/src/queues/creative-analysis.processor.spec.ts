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
    const textAi = { name: 'mock', model: 'mock-text-1', generate: jest.fn().mockResolvedValue({ text: JSON.stringify({ summary: '[MOCK 미디어 인사이트] sample', hookType: '질문형', targetAudience: ['성인'], emotionalTriggers: ['호기심'], genres: ['로맨스'] }) }) };
    const embedder = { name: 'mock', model: 'mock-embedding-1', dimension: 3, embed: jest.fn().mockResolvedValue([1, 0, 0]) };
    const vectors = { upsertMediaEmbedding: jest.fn() };
    const processor = new CreativeAnalysisProcessor(prisma as never, aiLog as never, {} as never, jobRecord as never, textAi as never, embedder as never, vectors as never, {} as never);
    await processor.process({ id: 'analyze-media--m1', name: JOB_TYPES.ANALYZE_MEDIA, data: { mediaAssetId: 'm1' }, attemptsMade: 0, opts: { attempts: 1 } } as never);
    expect(prisma.mediaInsight.create).toHaveBeenCalledWith({ data: expect.objectContaining({ mediaAssetId: 'm1', summary: '[MOCK 미디어 인사이트] sample', hookType: '질문형', targetAudience: ['성인'] }) });
  });
});

import { creativeAnalysisSchema, PROMPT_VERSION } from './creative-analysis.schema';

describe('creativeAnalysisSchema bilingual result', () => {
  it('parses the required Traditional Chinese companion fields', () => {
    const parsed = creativeAnalysisSchema.parse({
      summary: '한국어 요약',
      hook: { text: '첫 문장', type: '질문형' },
      callToAction: { text: '시작', type: '무료 시작' },
      targetAudience: ['성인'],
      emotionalTriggers: ['호기심'],
      genres: ['로맨스'],
      language: 'ko',
      zhTw: {
        summary: '繁體中文摘要',
        hookType: '提問型',
        targetAudience: ['成人'],
        emotionalTriggers: ['好奇心'],
        genres: ['戀愛'],
      },
    });

    expect(parsed.zhTw.summary).toBe('繁體中文摘要');
    expect(PROMPT_VERSION).toBe('analyze-creative@v2');
  });
});

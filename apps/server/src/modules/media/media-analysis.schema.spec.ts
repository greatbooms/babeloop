import { MEDIA_INSIGHT_PROMPT_VERSION, mediaInsightSchema } from './media-analysis.schema';

describe('mediaInsightSchema bilingual result', () => {
  it('parses the required Traditional Chinese companion fields', () => {
    const parsed = mediaInsightSchema.parse({
      summary: '한국어 요약', hookType: '질문형', targetAudience: ['성인'], emotionalTriggers: ['호기심'], genres: ['로맨스'],
      zhTw: { summary: '繁體中文摘要', hookType: '提問型', targetAudience: ['成人'], emotionalTriggers: ['好奇心'], genres: ['戀愛'] },
    });

    expect(parsed.zhTw.summary).toBe('繁體中文摘要');
    expect(MEDIA_INSIGHT_PROMPT_VERSION).toBe('analyze-media@v2');
  });
});

import { z } from 'zod';

export const MEDIA_INSIGHT_PROMPT_VERSION = 'analyze-media@v2';
export const MEDIA_INSIGHT_SYSTEM = `너는 광고 참고 미디어 분석가다.
최상위 필드는 한국어로 작성하고, zhTw 객체는 대만 번체중문으로 작성한다.
반드시 다음 JSON 필드명과 구조로만 응답하라:
{"summary":"한국어 요약","hookType":"한국어 훅 유형","targetAudience":["한국어 타깃"],"emotionalTriggers":["한국어 감정"],"genres":["한국어 장르"],"zhTw":{"summary":"繁體中文摘要","hookType":"繁體中文鉤子類型","targetAudience":["繁體中文受眾"],"emotionalTriggers":["繁體中文情緒"],"genres":["繁體中文類型"]}}`;
const translatedInsightFields = {
  summary: z.string().min(1), hookType: z.string().min(1), targetAudience: z.array(z.string()),
  emotionalTriggers: z.array(z.string()), genres: z.array(z.string()),
};
export const mediaInsightSchema = z.object({
  summary: z.string().min(1), hookType: z.string().min(1), targetAudience: z.array(z.string()),
  emotionalTriggers: z.array(z.string()), genres: z.array(z.string()),
  zhTw: z.object(translatedInsightFields),
});

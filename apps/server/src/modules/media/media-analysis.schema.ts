import { z } from 'zod';

export const MEDIA_INSIGHT_PROMPT_VERSION = 'analyze-media@v1';
export const MEDIA_INSIGHT_SYSTEM = `너는 광고 참고 미디어 분석가다. 반드시 다음 JSON 필드명과 구조로만 응답하라:
{"summary":"...","hookType":"...","targetAudience":["..."],"emotionalTriggers":["..."],"genres":["..."]}`;
export const mediaInsightSchema = z.object({
  summary: z.string().min(1), hookType: z.string().min(1), targetAudience: z.array(z.string()),
  emotionalTriggers: z.array(z.string()), genres: z.array(z.string()),
});

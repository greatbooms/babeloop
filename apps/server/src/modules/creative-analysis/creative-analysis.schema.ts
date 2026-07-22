import { z } from 'zod';

export const PROMPT_VERSION = 'analyze-creative@v2';

export const CREATIVE_ANALYSIS_SYSTEM = `너는 광고 크리에이티브 분석가다. 주어진 광고 텍스트를 분석한다.
최상위 필드는 한국어로 작성하고, zhTw 객체는 대만 번체중문으로 작성한다.

반드시 아래 JSON 구조와 필드명으로만 응답하라 (배열 값은 문자열 배열):
{"summary":"한국어 요약","hook":{"text":"한국어 훅 문구","type":"한국어 훅 유형"},"callToAction":{"text":"한국어 CTA","type":"한국어 CTA 유형"},"targetAudience":["한국어 타깃"],"emotionalTriggers":["한국어 감정"],"genres":["한국어 장르"],"language":"ko","zhTw":{"summary":"繁體中文摘要","hookType":"繁體中文鉤子類型","targetAudience":["繁體中文受眾"],"emotionalTriggers":["繁體中文情緒"],"genres":["繁體中文類型"]}}`;

const translatedFields = {
  summary: z.string().min(1),
  hookType: z.string().min(1),
  targetAudience: z.array(z.string()),
  emotionalTriggers: z.array(z.string()),
  genres: z.array(z.string()),
};

export const creativeAnalysisSchema = z.object({
  summary: z.string().min(1),
  hook: z.object({ text: z.string().optional(), type: z.string().min(1) }),
  callToAction: z.object({ text: z.string().optional(), type: z.string().optional() }),
  targetAudience: z.array(z.string()),
  emotionalTriggers: z.array(z.string()),
  genres: z.array(z.string()),
  language: z.string().min(1),
  zhTw: z.object(translatedFields),
});

export type CreativeAnalysisResult = z.infer<typeof creativeAnalysisSchema>;

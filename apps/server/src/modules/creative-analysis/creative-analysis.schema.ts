import { z } from 'zod';

export const PROMPT_VERSION = 'analyze-creative@v1';

export const creativeAnalysisSchema = z.object({
  summary: z.string().min(1),
  hook: z.object({ text: z.string().optional(), type: z.string().min(1) }),
  callToAction: z.object({ text: z.string().optional(), type: z.string().optional() }),
  targetAudience: z.array(z.string()),
  emotionalTriggers: z.array(z.string()),
  genres: z.array(z.string()),
  language: z.string().min(1),
});

export type CreativeAnalysisResult = z.infer<typeof creativeAnalysisSchema>;

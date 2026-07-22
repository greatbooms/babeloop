import { z } from 'zod';

export const GENERATION_PROMPT_VERSIONS = {
  brief: 'generate-brief@v2',
  copyVariants: 'generate-copy-variants@v1',
  videoScript: 'generate-video-script@v1',
  localizeZhTw: 'localize-zh-tw@v1',
  translateBrand: 'translate-brand@v1',
} as const;

const briefFields = {
  title: z.string().min(1),
  audienceHypothesis: z.string().min(1),
  desire: z.string().min(1),
  hookType: z.string().min(1),
  messageAngle: z.string().min(1),
  visualFormat: z.string().min(1),
  callToAction: z.string().min(1),
  rationale: z.string().min(1),
};

export const briefSchema = z.object({
  ...briefFields,
  // 번체중문 병행본 — 한국 작업자·대만 검수자가 같은 브리프를 각자 언어로 읽는다
  zhTw: z.object(briefFields),
});

export const copyVariantsSchema = z.object({
  variants: z
    .array(z.object({ koreanText: z.string().min(1), hookType: z.string().min(1) }))
    .min(1),
});

export const videoScriptSchema = z.object({
  variants: z
    .array(
      z.object({
        durationSeconds: z.number().positive(),
        hookType: z.string().min(1),
        scenes: z
          .array(
            z.object({
              seconds: z.number().nonnegative(),
              visual: z.string().min(1),
              dialogue: z.string(),
              caption: z.string(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export const localizationSchema = z.object({
  zhTw: z.string().min(1),
  notes: z.string().optional(),
});

export const brandTranslationSchema = z.object({
  description: z.string(),
  features: z.array(z.object({ name: z.string().min(1), description: z.string() })),
  guidelines: z.array(z.object({ title: z.string().min(1), content: z.string() })),
});

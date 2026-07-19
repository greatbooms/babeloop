import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().default('us-east-1'),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  WORKER_PORT: z.coerce.number().default(3001),
  OCR_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OCR_MODEL: z.string().optional(),
  STT_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  STT_API_KEY: z.string().optional(),
  STT_MODEL: z.string().default('whisper-1'),
  TEXT_AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  TEXT_AI_API_KEY: z.string().optional(),
  TEXT_AI_MODEL: z.string().optional(),
  TEXT_AI_USD_PER_MTOK_INPUT: z.coerce.number().optional(),
  TEXT_AI_USD_PER_MTOK_OUTPUT: z.coerce.number().optional(),
  EMBEDDING_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
}).superRefine((env, ctx) => {
  if (env.OCR_PROVIDER === 'openai' && !env.OCR_MODEL && !env.TEXT_AI_MODEL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['OCR_MODEL'], message: 'OCR_PROVIDER=openai이면 OCR_MODEL 또는 TEXT_AI_MODEL이 필요합니다' });
  }
  if (env.STT_PROVIDER === 'openai' && !env.STT_API_KEY && !env.TEXT_AI_API_KEY) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['STT_API_KEY'], message: 'STT_PROVIDER=openai이면 STT_API_KEY 또는 TEXT_AI_API_KEY가 필요합니다' });
  }
  if (env.TEXT_AI_PROVIDER === 'openai') {
    if (!env.TEXT_AI_API_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['TEXT_AI_API_KEY'], message: 'TEXT_AI_PROVIDER=openai이면 TEXT_AI_API_KEY가 필요합니다' });
    }
    if (!env.TEXT_AI_MODEL) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['TEXT_AI_MODEL'], message: 'TEXT_AI_PROVIDER=openai이면 TEXT_AI_MODEL이 필요합니다' });
    }
  }
  if (env.EMBEDDING_PROVIDER === 'openai' && !env.EMBEDDING_API_KEY) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['EMBEDDING_API_KEY'], message: 'EMBEDDING_PROVIDER=openai이면 EMBEDDING_API_KEY가 필요합니다' });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`환경변수 검증 실패:\n${result.error.toString()}`);
  }
  return result.data;
}

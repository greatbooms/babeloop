import { envSchema } from './env.validation';

const baseEnv = {
  APP_BASE_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: '0123456789abcdef',
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_BUCKET: 'test',
  OBJECT_STORAGE_ACCESS_KEY: 'test',
  OBJECT_STORAGE_SECRET_KEY: 'test-secret',
};

describe('envSchema OpenAI OCR·STT 설정', () => {
  it('OCR openai는 OCR_MODEL 또는 TEXT_AI_MODEL 중 하나를 요구한다', () => {
    const invalid = envSchema.safeParse({ ...baseEnv, OCR_PROVIDER: 'openai' });
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.toString()).toContain('OCR_MODEL 또는 TEXT_AI_MODEL');

    expect(envSchema.safeParse({ ...baseEnv, OCR_PROVIDER: 'openai', TEXT_AI_MODEL: 'gpt-test' }).success).toBe(true);
    expect(envSchema.safeParse({ ...baseEnv, OCR_PROVIDER: 'openai', OCR_MODEL: 'gpt-vision-test' }).success).toBe(true);
  });

  it('STT openai는 STT_API_KEY 또는 TEXT_AI_API_KEY 중 하나를 요구한다', () => {
    const invalid = envSchema.safeParse({ ...baseEnv, STT_PROVIDER: 'openai' });
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.toString()).toContain('STT_API_KEY 또는 TEXT_AI_API_KEY');

    expect(envSchema.safeParse({ ...baseEnv, STT_PROVIDER: 'openai', TEXT_AI_API_KEY: 'text-key' }).success).toBe(true);
    const parsed = envSchema.parse({ ...baseEnv, STT_PROVIDER: 'openai', STT_API_KEY: 'stt-key' });
    expect(parsed.STT_MODEL).toBe('whisper-1');
  });
});

import { OpenAITextGenerationProvider } from './openai-text-generation.provider';

function fakeClient(create: jest.Mock) {
  return { chat: { completions: { create } } };
}

describe('OpenAITextGenerationProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, TEXT_AI_MODEL: 'gpt-test' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('system/user 메시지와 json_object 형식으로 호출하고 content·usage를 반환한다', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    });
    const provider = new OpenAITextGenerationProvider(fakeClient(create));

    await expect(provider.generate({ system: 'system', prompt: 'user', responseHint: 'creative-analysis' })).resolves.toEqual({
      text: '{"ok":true}', inputTokens: 11, outputTokens: 7, costEstimateUsd: undefined,
    });
    expect(create).toHaveBeenCalledWith({
      model: 'gpt-test',
      messages: [{ role: 'system', content: 'system' }, { role: 'user', content: 'user' }],
      response_format: { type: 'json_object' },
    });
  });

  it('입출력 가격이 모두 있으면 USD 비용을 계산한다', async () => {
    process.env.TEXT_AI_USD_PER_MTOK_INPUT = '2';
    process.env.TEXT_AI_USD_PER_MTOK_OUTPUT = '8';
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: '{}' } }],
      usage: { prompt_tokens: 1_000_000, completion_tokens: 500_000 },
    });
    const provider = new OpenAITextGenerationProvider(fakeClient(create));

    await expect(provider.generate({ system: 's', prompt: 'p' })).resolves.toMatchObject({ costEstimateUsd: 6 });
  });

  it('가격 중 하나라도 없으면 비용을 반환하지 않는다', async () => {
    process.env.TEXT_AI_USD_PER_MTOK_INPUT = '2';
    delete process.env.TEXT_AI_USD_PER_MTOK_OUTPUT;
    const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: '{}' } }], usage: {} });
    const provider = new OpenAITextGenerationProvider(fakeClient(create));

    await expect(provider.generate({ system: 's', prompt: 'p' })).resolves.toMatchObject({ costEstimateUsd: undefined });
  });

  it('API 오류를 그대로 전파한다', async () => {
    const error = new Error('api failed');
    const provider = new OpenAITextGenerationProvider(fakeClient(jest.fn().mockRejectedValue(error)));
    await expect(provider.generate({ system: 's', prompt: 'p' })).rejects.toBe(error);
  });
});

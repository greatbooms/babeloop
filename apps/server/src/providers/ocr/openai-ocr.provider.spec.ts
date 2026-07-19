import { OpenAIOcrProvider } from './openai-ocr.provider';

function fakeClient(create: jest.Mock) {
  return { chat: { completions: { create } } };
}

describe('OpenAIOcrProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OCR_MODEL: 'gpt-vision-test' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('모델·JSON 구조 시스템 프롬프트·base64 image_url로 요청한다', async () => {
    const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"text":"광고 문구"}' } }] });
    const provider = new OpenAIOcrProvider(fakeClient(create));

    await provider.extractText({ buffer: Buffer.from('image'), contentType: 'image/png' });

    expect(create).toHaveBeenCalledWith({
      model: 'gpt-vision-test',
      messages: [
        { role: 'system', content: expect.stringContaining('{"text": "추출한 전체 텍스트 (줄바꿈 유지)"}') },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from('image').toString('base64')}` } }] },
      ],
      response_format: { type: 'json_object' },
    });
  });

  it('JSON 응답의 text와 usage를 매핑한다', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: '{"text":"첫 줄\\n둘째 줄"}' } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    });
    const provider = new OpenAIOcrProvider(fakeClient(create));

    await expect(provider.extractText({ buffer: Buffer.from('x'), contentType: 'image/jpeg' })).resolves.toEqual({
      text: '첫 줄\n둘째 줄', inputTokens: 12, outputTokens: 4, costEstimateUsd: undefined,
    });
  });

  it('텍스트 가격 env가 모두 있으면 비용을 계산한다', async () => {
    process.env.TEXT_AI_USD_PER_MTOK_INPUT = '2';
    process.env.TEXT_AI_USD_PER_MTOK_OUTPUT = '8';
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: '{"text":"ok"}' } }],
      usage: { prompt_tokens: 1_000_000, completion_tokens: 500_000 },
    });
    const provider = new OpenAIOcrProvider(fakeClient(create));

    await expect(provider.extractText({ buffer: Buffer.from('x'), contentType: 'image/png' })).resolves.toMatchObject({ costEstimateUsd: 6 });
  });

  it('JSON이 아닌 응답은 원문 전체를 text로 보존한다', async () => {
    const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: '그냥 나온 OCR 문구' } }] });
    const provider = new OpenAIOcrProvider(fakeClient(create));

    await expect(provider.extractText({ buffer: Buffer.from('x'), contentType: 'image/png' })).resolves.toMatchObject({ text: '그냥 나온 OCR 문구' });
  });

  it('API 오류를 그대로 전파한다', async () => {
    const error = new Error('api failed');
    const provider = new OpenAIOcrProvider(fakeClient(jest.fn().mockRejectedValue(error)));
    await expect(provider.extractText({ buffer: Buffer.from('x'), contentType: 'image/png' })).rejects.toBe(error);
  });
});

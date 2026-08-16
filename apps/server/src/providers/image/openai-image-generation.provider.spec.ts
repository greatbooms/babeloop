import {
  OpenAIImageGenerationClient,
  OpenAIImageGenerationProvider,
} from './openai-image-generation.provider';

describe('OpenAIImageGenerationProvider', () => {
  const previousLowPrice = process.env.IMAGE_PRICE_LOW_USD;
  const previousHighPrice = process.env.IMAGE_PRICE_HIGH_USD;

  afterEach(() => {
    if (previousLowPrice === undefined) delete process.env.IMAGE_PRICE_LOW_USD;
    else process.env.IMAGE_PRICE_LOW_USD = previousLowPrice;
    if (previousHighPrice === undefined) delete process.env.IMAGE_PRICE_HIGH_USD;
    else process.env.IMAGE_PRICE_HIGH_USD = previousHighPrice;
  });

  it('gpt-image-1 요청을 base64 PNG와 장수별 비용으로 변환한다', async () => {
    process.env.IMAGE_PRICE_LOW_USD = '0.05';
    const png = Buffer.from('deterministic-png');
    const generate = jest.fn().mockResolvedValue({
      data: [{ b64_json: png.toString('base64') }, { b64_json: png.toString('base64') }],
    });
    const edit = jest.fn();
    const client: OpenAIImageGenerationClient = { images: { generate, edit } };
    const provider = new OpenAIImageGenerationProvider(client);

    const result = await provider.generate({ prompt: '광고 이미지', count: 2, quality: 'low' });

    expect(generate).toHaveBeenCalledWith({
      model: 'gpt-image-1',
      prompt: '광고 이미지',
      n: 2,
      quality: 'low',
      size: '1024x1024',
    });
    expect(edit).not.toHaveBeenCalled();
    expect(result.images).toEqual([
      { buffer: png, contentType: 'image/png' },
      { buffer: png, contentType: 'image/png' },
    ]);
    expect(result.costEstimateUsd).toBe(0.1);
  });

  it('참고 이미지가 있으면 high fidelity edit 요청을 사용한다', async () => {
    const png = Buffer.from('edited-png');
    const generate = jest.fn().mockRejectedValue(new Error('generate must not be called'));
    const edit = jest.fn().mockResolvedValue({
      data: [{ b64_json: png.toString('base64') }],
    });
    const client = { images: { generate, edit } } as unknown as OpenAIImageGenerationClient;
    const provider = new OpenAIImageGenerationProvider(client);
    const reference = Buffer.from('reference-jpeg');

    const result = await provider.generate({
      prompt: '참고 스타일을 유지한 광고 이미지',
      count: 1,
      quality: 'high',
      size: '1024x1536',
      referenceImages: [{ buffer: reference, contentType: 'image/jpeg' }],
    });

    expect(generate).not.toHaveBeenCalled();
    expect(edit).toHaveBeenCalledTimes(1);
    const request = edit.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      model: 'gpt-image-1',
      prompt: '참고 스타일을 유지한 광고 이미지',
      n: 1,
      quality: 'high',
      size: '1024x1536',
      input_fidelity: 'high',
    });
    expect(request.image).toHaveLength(1);
    expect(request.image[0]).toMatchObject({ name: 'ref-1.png', type: 'image/jpeg' });
    expect(Buffer.from(await request.image[0].arrayBuffer())).toEqual(reference);
    expect(result.images).toEqual([{ buffer: png, contentType: 'image/png' }]);
    expect(result.costEstimateUsd).toBeCloseTo(0.285);
  });

  it('비참고 생성에도 가로형 네이티브 크기와 1.5배 비용을 적용한다', async () => {
    process.env.IMAGE_PRICE_LOW_USD = '0.04';
    const png = Buffer.from('landscape-png');
    const generate = jest.fn().mockResolvedValue({
      data: [{ b64_json: png.toString('base64') }],
    });
    const edit = jest.fn();
    const client = { images: { generate, edit } } as unknown as OpenAIImageGenerationClient;
    const provider = new OpenAIImageGenerationProvider(client);

    const result = await provider.generate({
      prompt: '가로형 광고 이미지',
      count: 1,
      quality: 'low',
      size: '1536x1024',
    });

    expect(generate).toHaveBeenCalledWith({
      model: 'gpt-image-1',
      prompt: '가로형 광고 이미지',
      n: 1,
      quality: 'low',
      size: '1536x1024',
    });
    expect(edit).not.toHaveBeenCalled();
    expect(result.costEstimateUsd).toBe(0.06);
  });
});
describe('usage 기반 실비', () => {
  it('응답 usage가 있으면 토큰 단가로 실제 비용을 계산한다', async () => {
    const client = {
      images: {
        generate: jest.fn().mockResolvedValue({
          data: [{ b64_json: Buffer.from('x').toString('base64') }],
          usage: {
            input_tokens: 1100,
            output_tokens: 4160,
            input_tokens_details: { text_tokens: 1000, image_tokens: 100 },
          },
        }),
        edit: jest.fn(),
      },
    };
    const provider = new OpenAIImageGenerationProvider(client as never);
    const result = await provider.generate({ prompt: 'p', count: 1, quality: 'high' } as never);
    // 1000*5 + 100*10 + 4160*40 = 172,400 / 1M = 0.1724
    expect(result.costEstimateUsd).toBeCloseTo(0.1724, 4);
    expect(result.inputTokens).toBe(1100);
    expect(result.outputTokens).toBe(4160);
  });

  it('usage가 없으면 장당 추정으로 폴백한다', async () => {
    const client = {
      images: {
        generate: jest.fn().mockResolvedValue({ data: [{ b64_json: Buffer.from('x').toString('base64') }] }),
        edit: jest.fn(),
      },
    };
    const provider = new OpenAIImageGenerationProvider(client as never);
    const result = await provider.generate({ prompt: 'p', count: 1, quality: 'low' } as never);
    expect(result.costEstimateUsd).toBeCloseTo(0.04, 4);
    expect(result.inputTokens).toBeUndefined();
  });
});


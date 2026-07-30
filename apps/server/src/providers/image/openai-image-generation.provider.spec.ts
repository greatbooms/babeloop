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
    const client: OpenAIImageGenerationClient = { images: { generate } };
    const provider = new OpenAIImageGenerationProvider(client);

    const result = await provider.generate({ prompt: '광고 이미지', count: 2, quality: 'low' });

    expect(generate).toHaveBeenCalledWith({
      model: 'gpt-image-1',
      prompt: '광고 이미지',
      n: 2,
      quality: 'low',
      size: '1024x1024',
    });
    expect(result.images).toEqual([
      { buffer: png, contentType: 'image/png' },
      { buffer: png, contentType: 'image/png' },
    ]);
    expect(result.costEstimateUsd).toBe(0.1);
  });
});

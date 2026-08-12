import { MockVideoGenerationProvider } from './mock-video-generation.provider';

describe('MockVideoGenerationProvider', () => {
  const originalPrice = process.env.VIDEO_PRICE_PER_SECOND_USD;

  afterEach(() => {
    if (originalPrice === undefined) delete process.env.VIDEO_PRICE_PER_SECOND_USD;
    else process.env.VIDEO_PRICE_PER_SECOND_USD = originalPrice;
  });

  it('결정적 MP4와 길이에 비례한 예상 비용을 반환한다', async () => {
    process.env.VIDEO_PRICE_PER_SECOND_USD = '0.10';
    const provider = new MockVideoGenerationProvider();

    const first = await provider.generate({ prompt: '첫 장면표', seconds: 8 });
    const second = await provider.generate({
      prompt: '다른 장면표',
      seconds: 4,
      size: '720x1280',
      inputReference: { buffer: Buffer.from('reference'), contentType: 'image/jpeg' },
    });

    expect(provider.name).toBe('mock');
    expect(provider.model).toBe('mock-video-1');
    expect(first.video.contentType).toBe('video/mp4');
    expect(first.video.buffer.subarray(4, 8).toString('ascii')).toBe('ftyp');
    expect(first.video.buffer.length).toBeGreaterThanOrEqual(1024);
    expect(first.video.buffer).toEqual(second.video.buffer);
    expect(first.costEstimateUsd).toBeCloseTo(0.8);
    expect(second.costEstimateUsd).toBeCloseTo(0.4);
  });
});

import { MockImageGenerationProvider } from './mock-image-generation.provider';

describe('MockImageGenerationProvider', () => {
  it('요청한 장수만큼 동일한 결정적 PNG를 반환한다', async () => {
    const provider = new MockImageGenerationProvider();

    const first = await provider.generate({ prompt: '광고 이미지', count: 2, quality: 'low' });
    const second = await provider.generate({ prompt: '다른 프롬프트', count: 1, quality: 'high' });

    expect(provider.name).toBe('mock');
    expect(provider.model).toBe('mock-image-1');
    expect(first.images).toHaveLength(2);
    expect(first.images[0]?.contentType).toBe('image/png');
    expect(first.images[0]?.buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(first.images[0]?.buffer.length).toBeGreaterThanOrEqual(1024);
    expect(first.images[0]?.buffer).toEqual(first.images[1]?.buffer);
    expect(first.images[0]?.buffer).toEqual(second.images[0]?.buffer);
    expect(first.costEstimateUsd).toBe(0);
  });
});

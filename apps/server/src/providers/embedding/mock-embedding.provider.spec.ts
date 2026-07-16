import { MockEmbeddingProvider } from './mock-embedding.provider';

describe('MockEmbeddingProvider', () => {
  const provider = new MockEmbeddingProvider();

  it('차원은 1536이고 같은 텍스트는 같은 벡터 (결정적)', async () => {
    const a = await provider.embed('내가 주인공이 되는 이야기');
    const b = await provider.embed('내가 주인공이 되는 이야기');
    expect(a).toHaveLength(1536);
    expect(a).toEqual(b);
  });

  it('다른 텍스트는 다른 벡터', async () => {
    const a = await provider.embed('텍스트 A');
    const b = await provider.embed('텍스트 B');
    expect(a).not.toEqual(b);
  });

  it('단위 벡터로 정규화된다', async () => {
    const v = await provider.embed('정규화 확인');
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
});

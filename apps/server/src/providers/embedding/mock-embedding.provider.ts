import { createHash } from 'crypto';
import { EmbeddingProvider } from './embedding.provider';

/** sha256 시드 xorshift32 — 같은 텍스트면 항상 같은 단위 벡터. */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly model = 'mock-embedding-1';
  readonly dimension = 1536;

  async embed(text: string): Promise<number[]> {
    const seedBytes = createHash('sha256').update(text).digest();
    let state = seedBytes.readUInt32LE(0) || 1;
    const next = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0xffffffff;
    };
    const v = Array.from({ length: this.dimension }, () => next() * 2 - 1);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return v.map((x) => x / norm);
  }
}

import { OpenAIEmbeddingProvider } from './openai-embedding.provider';

function fakeClient(create: jest.Mock) {
  return { embeddings: { create } };
}

describe('OpenAIEmbeddingProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, EMBEDDING_MODEL: 'embedding-test' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('설정한 모델과 입력을 전달하고 1536차원 벡터를 반환한다', async () => {
    const vector = Array.from({ length: 1536 }, (_, index) => index / 1536);
    const create = jest.fn().mockResolvedValue({ data: [{ embedding: vector }] });
    const provider = new OpenAIEmbeddingProvider(fakeClient(create));

    await expect(provider.embed('hello')).resolves.toEqual(vector);
    expect(create).toHaveBeenCalledWith({ model: 'embedding-test', input: 'hello' });
  });

  it('응답이 1536차원이 아니면 명시적 오류를 던진다', async () => {
    const provider = new OpenAIEmbeddingProvider(
      fakeClient(jest.fn().mockResolvedValue({ data: [{ embedding: [0, 1] }] })),
    );

    await expect(provider.embed('hello')).rejects.toThrow('임베딩 차원 불일치');
  });
});

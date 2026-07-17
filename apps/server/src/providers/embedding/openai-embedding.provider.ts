import { EmbeddingProvider } from './embedding.provider';

export interface OpenAIEmbeddingClient {
  embeddings: {
    create(input: { model: string; input: string }): Promise<{
      data: Array<{ embedding: number[] }>;
    }>;
  };
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
  readonly dimension = 1536;
  private readonly client: OpenAIEmbeddingClient;

  constructor(client?: OpenAIEmbeddingClient) {
    if (client) {
      this.client = client;
      return;
    }
    // SDK 로드는 실제 OpenAI provider를 선택할 때만 수행해 mock 기본 경로를 격리한다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OpenAI = require('openai').default;
    this.client = new OpenAI({ apiKey: process.env.EMBEDDING_API_KEY });
  }

  async embed(text: string): Promise<number[]> {
    // OpenAI embedding usage 기록은 이번 범위 밖이다.
    const response = await this.client.embeddings.create({ model: this.model, input: text });
    const vector = response.data[0]?.embedding ?? [];
    if (vector.length !== this.dimension) {
      throw new Error(`임베딩 차원 불일치: 기대 ${this.dimension}, 실제 ${vector.length}`);
    }
    return vector;
  }
}

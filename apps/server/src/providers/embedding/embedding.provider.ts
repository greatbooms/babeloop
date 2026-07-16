export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
}

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

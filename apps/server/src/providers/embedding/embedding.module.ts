import { Global, Module } from '@nestjs/common';
import { EMBEDDING_PROVIDER } from './embedding.provider';
import { MockEmbeddingProvider } from './mock-embedding.provider';
import { OpenAIEmbeddingProvider } from './openai-embedding.provider';

@Global()
@Module({
  providers: [
    {
      provide: EMBEDDING_PROVIDER,
      useFactory: () => {
        const kind = process.env.EMBEDDING_PROVIDER ?? 'mock';
        if (kind === 'mock') return new MockEmbeddingProvider();
        if (kind === 'openai') return new OpenAIEmbeddingProvider();
        throw new Error(`미구현 Embedding provider: ${kind}`);
      },
    },
  ],
  exports: [EMBEDDING_PROVIDER],
})
export class EmbeddingModule {}

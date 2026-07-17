import { Global, Module } from '@nestjs/common';
import { MockTextGenerationProvider } from './mock-text-generation.provider';
import { OpenAITextGenerationProvider } from './openai-text-generation.provider';
import { TEXT_GENERATION_PROVIDER } from './text-generation.provider';

@Global()
@Module({
  providers: [
    {
      provide: TEXT_GENERATION_PROVIDER,
      useFactory: () => {
        const kind = process.env.TEXT_AI_PROVIDER ?? 'mock';
        if (kind === 'mock') return new MockTextGenerationProvider();
        if (kind === 'openai') return new OpenAITextGenerationProvider();
        throw new Error(`미구현 Text AI provider: ${kind}`);
      },
    },
  ],
  exports: [TEXT_GENERATION_PROVIDER],
})
export class TextModule {}

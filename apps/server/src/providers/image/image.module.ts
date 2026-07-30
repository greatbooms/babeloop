import { Global, Module } from '@nestjs/common';
import { IMAGE_GENERATION_PROVIDER } from './image-generation.provider';
import { MockImageGenerationProvider } from './mock-image-generation.provider';
import { OpenAIImageGenerationProvider } from './openai-image-generation.provider';

@Global()
@Module({
  providers: [
    {
      provide: IMAGE_GENERATION_PROVIDER,
      useFactory: () => {
        const kind = process.env.IMAGE_PROVIDER ?? 'mock';
        if (kind === 'mock') return new MockImageGenerationProvider();
        if (kind === 'openai') return new OpenAIImageGenerationProvider();
        throw new Error(`미구현 Image provider: ${kind}`);
      },
    },
  ],
  exports: [IMAGE_GENERATION_PROVIDER],
})
export class ImageModule {}

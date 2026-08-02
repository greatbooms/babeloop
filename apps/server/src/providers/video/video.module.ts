import { Global, Module } from '@nestjs/common';
import { MockVideoGenerationProvider } from './mock-video-generation.provider';
import { OpenAIVideoGenerationProvider } from './openai-video-generation.provider';
import { VIDEO_GENERATION_PROVIDER } from './video-generation.provider';

@Global()
@Module({
  providers: [
    {
      provide: VIDEO_GENERATION_PROVIDER,
      useFactory: () => {
        const kind = process.env.VIDEO_PROVIDER ?? 'mock';
        if (kind === 'mock') return new MockVideoGenerationProvider();
        if (kind === 'openai') return new OpenAIVideoGenerationProvider();
        throw new Error(`미구현 Video provider: ${kind}`);
      },
    },
  ],
  exports: [VIDEO_GENERATION_PROVIDER],
})
export class VideoModule {}

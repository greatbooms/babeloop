import { Global, Module } from '@nestjs/common';
import { MockSttProvider } from './mock-stt.provider';
import { OpenAISttProvider } from './openai-stt.provider';
import { STT_PROVIDER } from './stt.provider';

@Global()
@Module({
  providers: [
    {
      provide: STT_PROVIDER,
      useFactory: () => {
        const kind = process.env.STT_PROVIDER ?? 'mock';
        if (kind === 'mock') return new MockSttProvider();
        if (kind === 'openai') return new OpenAISttProvider();
        throw new Error(`미구현 STT provider: ${kind}`);
      },
    },
  ],
  exports: [STT_PROVIDER],
})
export class SttModule {}

import { Global, Module } from '@nestjs/common';
import { MockOcrProvider } from './mock-ocr.provider';
import { OCR_PROVIDER } from './ocr.provider';

@Global()
@Module({
  providers: [
    {
      provide: OCR_PROVIDER,
      useFactory: () => {
        const kind = process.env.OCR_PROVIDER ?? 'mock';
        if (kind === 'mock') return new MockOcrProvider();
        throw new Error(`미구현 OCR provider: ${kind}`);
      },
    },
  ],
  exports: [OCR_PROVIDER],
})
export class OcrModule {}

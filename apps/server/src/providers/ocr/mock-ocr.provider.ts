import { createHash } from 'crypto';
import { OcrInput, OcrOutput, OcrProvider } from './ocr.provider';

/** 결정적 Mock — 같은 입력이면 항상 같은 출력. E2E가 이 형식에 의존한다. */
export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock';
  readonly model = 'mock-ocr-1';

  async extractText(input: OcrInput): Promise<OcrOutput> {
    const hash = createHash('sha256').update(input.buffer).digest('hex').slice(0, 8);
    return { text: `[MOCK OCR] ${input.filename ?? 'file'} (${hash})` };
  }
}

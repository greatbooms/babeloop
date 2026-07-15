import { createHash } from 'crypto';
import { SttInput, SttOutput, SttProvider } from './stt.provider';

/** 결정적 Mock — 같은 입력이면 항상 같은 출력. */
export class MockSttProvider implements SttProvider {
  readonly name = 'mock';
  readonly model = 'mock-stt-1';

  async transcribe(input: SttInput): Promise<SttOutput> {
    const hash = createHash('sha256').update(input.buffer).digest('hex').slice(0, 8);
    return { text: `[MOCK STT] ${input.filename ?? 'file'} (${hash})`, language: 'zh-TW' };
  }
}

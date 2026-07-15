import { MockOcrProvider } from './mock-ocr.provider';

describe('MockOcrProvider', () => {
  const provider = new MockOcrProvider();

  it('같은 입력에 같은 출력 (결정적)', async () => {
    const input = { buffer: Buffer.from('abc'), contentType: 'image/png', filename: 'a.png' };
    const first = await provider.extractText(input);
    const second = await provider.extractText(input);
    expect(first).toEqual(second);
    expect(first.text).toContain('[MOCK OCR]');
    expect(first.text).toContain('a.png');
  });
});

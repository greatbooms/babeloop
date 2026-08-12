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

  it('비주얼 묘사를 결정적인 신규 mock 접두사로 반환한다', async () => {
    const input = { buffer: Buffer.from('abc'), contentType: 'image/png' };

    const first = await provider.describe(input);
    const second = await provider.describe(input);

    expect(first).toEqual(second);
    expect(first).toEqual({ text: '[MOCK 비주얼] 광고 이미지 묘사', costEstimateUsd: 0.01 });
  });
});

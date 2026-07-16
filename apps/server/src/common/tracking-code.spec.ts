import { adNameFor, buildTrackingCode, parseTrackingCode, utmContentFor } from './tracking-code';

describe('trackingCode', () => {
  it('생성 → 파싱 왕복이 보존된다', () => {
    const code = buildTrackingCode({ experimentCode: 'TW01', variantCode: 'V3', revision: 2 });
    expect(code).toBe('BL-TW01-V3-R2');
    expect(parseTrackingCode(code)).toEqual({
      experimentCode: 'TW01',
      variantCode: 'V3',
      revision: 2,
    });
  });

  it('실험 코드는 대문자·숫자 2~8자만 허용', () => {
    expect(() =>
      buildTrackingCode({ experimentCode: 'tw-01', variantCode: 'V1', revision: 1 }),
    ).toThrow();
    expect(() =>
      buildTrackingCode({ experimentCode: 'T', variantCode: 'V1', revision: 1 }),
    ).toThrow();
  });

  it('파싱 실패는 null (예외 아님) — CSV 조인 경로에서 쓰인다', () => {
    expect(parseTrackingCode('BL-TW01-V1')).toBeNull();
    expect(parseTrackingCode('XX-TW01-V1-R1')).toBeNull();
    expect(parseTrackingCode('BL-TW01-V1-R0')).toBeNull();
    expect(parseTrackingCode('아무거나')).toBeNull();
  });

  it('광고명·UTM 헬퍼', () => {
    expect(adNameFor('BL-TW01-V1-R1', '질문형')).toBe(
      'BL-TW01-V1-R1 | zh-TW | hook=질문형',
    );
    expect(utmContentFor('BL-TW01-V1-R1')).toBe('utm_content=BL-TW01-V1-R1');
  });
});

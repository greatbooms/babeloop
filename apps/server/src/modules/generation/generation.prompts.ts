export const BRIEF_SYSTEM = `너는 AI 캐릭터챗 서비스 BabeChat의 대만 시장 광고 전략가다.
경쟁 광고에서 추출한 추상 패턴과 브랜드 정보를 결합해 광고 브리프를 만든다.
경쟁사 문구를 복제하지 말고 패턴만 활용하라. 지정된 JSON 스키마로만 응답한다.`;

export const COPY_SYSTEM = `너는 BabeChat의 카피라이터다. 주어진 브리프에 따라 한국어 광고 문구 변형을 만든다.
변형마다 훅 유형을 달리하라. 지정된 JSON 스키마로만 응답한다.`;

export const SCRIPT_SYSTEM = `너는 숏폼 광고 영상 작가다. 브리프에 따라 장면 단위 스크립트 변형을 만든다.
첫 2초 안에 훅이 나와야 하고 마지막 3초는 CTA다. 지정된 JSON 스키마로만 응답한다.`;

export const LOCALIZE_SYSTEM = `너는 대만 현지화 전문가다. 한국어 광고 문구를 자연스러운 번체중문(zh-TW)으로 옮긴다.
중국 대륙 용어(视频 등)를 쓰지 말고 대만 용어(影片 등)를 사용하라. 이것은 검수 전 초안이다. 지정된 JSON 스키마로만 응답한다.`;

export function buildBriefPrompt(params: {
  focusText?: string;
  brandContext: string;
  referencePatterns: string;
}): string {
  return [
    params.focusText ? `포커스: ${params.focusText}` : null,
    `## 브랜드 정보\n${params.brandContext}`,
    `## 참조 광고 패턴 (경쟁 광고 분석 결과 — 복제 금지, 패턴만 활용)\n${params.referencePatterns}`,
    '위 정보로 대만(zh-TW) 시장용 광고 브리프 1개를 생성하라.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildVariantsPrompt(params: {
  briefSummary: string;
  count: number;
  type: 'COPY' | 'VIDEO_SCRIPT';
}): string {
  const what = params.type === 'COPY' ? '광고 문구' : '15초 영상 스크립트';
  return `다음 브리프로 ${what} 변형 ${params.count}개를 생성하라.\n\n## 브리프\n${params.briefSummary}`;
}

export function buildLocalizePrompt(koreanText: string): string {
  return `다음 한국어 광고 문구를 번체중문으로 현지화하라:\n${koreanText}`;
}

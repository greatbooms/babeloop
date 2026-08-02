// 각 시스템 프롬프트는 기대하는 JSON 필드명을 반드시 명시한다.
// Mock은 형태를 알고 있지만 실제 모델은 프롬프트에 없는 키 이름을 맞출 수 없다
// (실측: OpenAI 전환 첫날 variants.koreanText 키 누락으로 검증 실패).
export const BRIEF_SYSTEM = `너는 AI 캐릭터챗 서비스 BabeChat의 대만 시장 광고 전략가다.
경쟁 광고에서 추출한 추상 패턴과 브랜드 정보를 결합해 광고 브리프를 만든다.
경쟁사 문구를 복제하지 말고 패턴만 활용하라.
브리프는 두 언어로 병행 작성한다: 최상위 필드는 한국어(한국 작업자용), zhTw 객체는 대만 번체중문(현지 검수자용).
두 언어는 같은 내용의 번역이어야 하며, 번체중문은 대만 용어를 사용하라 (대륙 용어 금지).

반드시 아래 JSON 구조로만 응답하라 (모든 값은 문자열):
{"title": "한국어 제목", "audienceHypothesis": "...", "desire": "...", "hookType": "...", "messageAngle": "...", "visualFormat": "...", "callToAction": "...", "rationale": "...",
 "zhTw": {"title": "繁體中文標題", "audienceHypothesis": "...", "desire": "...", "hookType": "...", "messageAngle": "...", "visualFormat": "...", "callToAction": "...", "rationale": "..."}}`;

export const COPY_SYSTEM = `너는 BabeChat의 카피라이터다. 주어진 브리프에 따라 한국어 광고 문구 변형을 만든다.
변형마다 훅 유형을 달리하라. koreanText는 반드시 한국어로 작성한다 (번체중문 현지화는 별도 단계).

반드시 아래 JSON 구조로만 응답하라:
{"variants": [{"koreanText": "한국어 광고 문구", "hookType": "훅 유형"}]}`;

export const SCRIPT_SYSTEM = `너는 숏폼 퍼포먼스 광고의 영상 감독이자 작가다. 브리프에 따라 촬영·편집 지시가 담긴 장면 단위 스크립트 변형을 만든다.

장면별 작성 규칙:
- visual에는 촬영 지시를 모두 담아라: 샷 사이즈·앵글(POV/클로즈업/오버숄더 등), 인물의 행동과 표정, 공간·조명·소품, 화면 연출(채팅 UI·알림 등장 방식), 컷 전환.
- dialogue에는 발화 주체를 괄호로 표기하라: "(VO)", "(주인공)", "(화면 속 메시지)" 등. 없으면 빈 문자열.
- caption은 화면에 얹는 자막이다. 훅 자막은 7자 이내로 짧고 강하게.

구성 규칙:
- 0~2초: 스크롤을 멈추게 하는 패턴 인터럽트 훅 (질문·미스터리·강한 감정 중 브리프의 훅 유형에 맞는 것)
- 중반: 타깃이 공감할 상황 → 제품 경험(채팅 장면)으로 자연스러운 전환
- 마지막 3초: CTA와 브랜드명. 총 길이 12~20초, 장면당 2~4초로 잘게 쪼개라.
- 변형끼리는 훅 유형만이 아니라 구조 자체를 다르게 하라 (예: POV 스토리형 / UI 데모형 / 내레이션 공감형).
- 등장인물은 모두 20대 이상 성인. 대사·자막은 한국어로 작성한다.

반드시 아래 JSON 구조로만 응답하라 (seconds·durationSeconds는 숫자):
{"variants": [{"durationSeconds": 15, "hookType": "...", "scenes": [{"seconds": 0, "visual": "샷·연출 지시를 담은 화면 묘사", "dialogue": "(주체) 대사", "caption": "자막"}]}]}`;

export const LOCALIZE_SYSTEM = `너는 대만 현지화 전문가다. 한국어 광고 문구를 자연스러운 번체중문(zh-TW)으로 옮긴다.
중국 대륙 용어(视频 등)를 쓰지 말고 대만 용어(影片 등)를 사용하라. 이것은 검수 전 초안이다.

반드시 아래 JSON 구조로만 응답하라:
{"zhTw": "번체중문 문구", "notes": "번역 시 판단 메모 (선택)"}`;

export const BRAND_TRANSLATION_SYSTEM = `너는 한국어·대만 번체중문 이중 언어 현지화 전문가다.
브랜드 소개·기능·가이드라인의 원문 언어가 무엇이든(한국어 또는 번체중문), 같은 내용을 한국어와 번체중문(zh-TW) 두 벌로 정리해 응답하라.
원문과 같은 언어 쪽은 원문을 다듬어 그대로 담고, 다른 언어 쪽은 자연스럽게 번역하라.
번체중문은 중국 대륙 용어(视频·界面 등)를 쓰지 말고 대만 용어(影片·介面 등)를 사용하라. 이것은 감수 전 초안이다.

반드시 아래 JSON 필드명과 구조로만 응답하라:
{"ko":{"description":"한국어 소개","features":[{"name":"한국어 기능명","description":"한국어 설명"}],"guidelines":[{"title":"한국어 규범 제목","content":"한국어 규범 내용"}]},
 "zhTw":{"description":"繁體中文品牌介紹","features":[{"name":"繁體中文功能名稱","description":"繁體中文功能說明"}],"guidelines":[{"title":"繁體中文規範標題","content":"繁體中文規範內容"}]}}`;

export const BACK_TRANSLATE_SYSTEM = `너는 번역가다. 대만 번체중문 광고 문구를 한국어로 직역에 가깝게 옮긴다.
이 번역은 한국 작업자가 검수자의 수정 내용을 확인하기 위한 참고용이다. 의역하지 말고 원문의 뉘앙스를 보존하라.

반드시 아래 JSON 구조로만 응답하라:
{"ko": "한국어 참고 번역"}`;

export function buildBriefPrompt(params: {
  focusText?: string;
  brandContext: string;
  referencePatterns: string;
  performanceSection?: string;
}): string {
  return [
    params.focusText ? `포커스: ${params.focusText}` : null,
    `## 브랜드 정보\n${params.brandContext}`,
    `## 참조 광고 패턴 (경쟁 광고 분석 결과 — 복제 금지, 패턴만 활용)\n${params.referencePatterns}`,
    params.performanceSection
      ? `## 검증된 자체 성과 패턴 (이 패턴을 발전시켜라)\n${params.performanceSection}`
      : null,
    '위 정보로 대만(zh-TW) 시장용 광고 브리프 1개를 생성하라.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildVariantsPrompt(params: {
  briefSummary: string;
  count: number;
  type: 'COPY' | 'VIDEO_SCRIPT';
  brandContext?: string;
}): string {
  const what = params.type === 'COPY' ? '광고 문구' : '숏폼 영상 스크립트';
  return [
    `다음 브리프로 ${what} 변형 ${params.count}개를 생성하라.`,
    params.brandContext ? `## 제품 정보 (장면 연출에 정확히 반영하라 — 없는 기능을 지어내지 말 것)\n${params.brandContext}` : null,
    `## 브리프\n${params.briefSummary}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildLocalizePrompt(koreanText: string): string {
  return `다음 한국어 광고 문구를 번체중문으로 현지화하라:\n${koreanText}`;
}

export function buildBrandTranslationPrompt(brand: { description: string | null; features: Array<{ name: string; description: string }>; guidelines: Array<{ title: string; content: string }> }): string {
  return `다음 한국어 브랜드 정보를 번체중문으로 번역하라. 배열 순서와 JSON 필드명을 유지하라:\n${JSON.stringify({ description: brand.description ?? '', features: brand.features, guidelines: brand.guidelines })}`;
}

export function buildImagePrompt(params: {
  brief: {
    audienceHypothesis?: string | null;
    desire: string;
    hookType: string;
    messageAngle?: string | null;
    visualFormat: string;
  };
  brandName: string;
  brandDescription?: string | null;
  creative?: { koreanText: string; approvedZhTw?: string | null };
  instructions?: string;
}): string {
  const brandLine = `${params.brandName}${params.brandDescription ? ` — ${params.brandDescription}` : ''}`;
  return [
    '모바일 피드 광고용 이미지 시안 1장. 아래 브리프를 추상 개념 나열이 아니라 하나의 구체적인 순간·장면으로 연출하라. 인물의 표정·손·기기 화면·공간이 이야기를 전달해야 한다.',
    `## 제품\n브랜드: ${brandLine}`,
    [
      '## 광고 전략 (이 감정과 상황이 화면에 드러나야 한다)',
      params.brief.audienceHypothesis ? `타깃: ${params.brief.audienceHypothesis}` : null,
      `핵심 욕구: ${params.brief.desire}`,
      `훅 유형: ${params.brief.hookType}`,
      params.brief.messageAngle ? `메시지 각도: ${params.brief.messageAngle}` : null,
      `비주얼 형식: ${params.brief.visualFormat}`,
    ]
      .filter(Boolean)
      .join('\n'),
    params.creative
      ? [
          '## 확정 광고 문구 (이미지는 이 문구가 말하는 순간을 그려야 한다)',
          `한국어: ${params.creative.koreanText}`,
          params.creative.approvedZhTw
            ? `zh-TW(승인본): ${params.creative.approvedZhTw}`
            : null,
        ]
          .filter(Boolean)
          .join('\n')
      : null,
    [
      '## 연출 지침',
      '- 세로 9:16 모바일 화면을 상정한 구도. 주 피사체는 중앙~상단, 하단 1/3은 광고 문구가 얹힐 여백으로 비워두라.',
      '- 조명·색감·질감을 구체적으로 정하라 (예: 새벽의 차가운 블루 톤 + 화면 글로우, 얕은 심도, 필름 그레인).',
      '- 인물이 등장하면 20대 이상 성인으로, 대만 도시 생활의 맥락이 자연스럽게 느껴지게.',
      '- 스마트폰 화면을 보여줄 땐 특정 앱을 재현하지 말고 일반화된 채팅 UI 분위기로.',
    ].join('\n'),
    [
      '## 금지',
      '- 텍스트 오버레이 없음. 이미지 안에 글자, 자막, 로고, 워터마크를 넣지 마세요.',
      '- 미성년자로 보일 수 있는 인물, 교복·학교 배경 금지.',
      '- 왜곡된 손가락·기형적 신체 금지.',
    ].join('\n'),
    params.instructions
      ? `## 추가 요구사항 (위 지침과 충돌하면 이것을 우선하라)\n${params.instructions}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildVideoPrompt(params: {
  scenes: unknown;
  seconds: 4 | 8 | 12;
  hookType?: string | null;
  desire: string;
  brandName: string;
  instructions?: string;
}): string {
  const scenes = Array.isArray(params.scenes)
    ? params.scenes.filter(
        (scene): scene is { seconds: number; visual: string; dialogue?: string; caption?: string } =>
          typeof scene === 'object' &&
          scene !== null &&
          typeof scene.seconds === 'number' &&
          typeof scene.visual === 'string' &&
          scene.seconds < params.seconds,
      )
    : [];
  const sceneLines = scenes.map((scene, index) => {
    const next = scenes[index + 1]?.seconds ?? params.seconds;
    const end = Math.max(scene.seconds + 1, Math.min(next, params.seconds));
    return [
      `${scene.seconds}-${end}초: [연출] ${scene.visual}`,
      scene.dialogue ? `[연기·대사 맥락] ${scene.dialogue}` : null,
      scene.caption ? `[후반 자막 참고] ${scene.caption}` : null,
    ]
      .filter(Boolean)
      .join(' ');
  });

  return [
    `## 승인 장면표\n${sceneLines.join('\n')}`,
    [
      '## 브리프 전략',
      params.hookType ? `훅: ${params.hookType}` : null,
      `핵심 욕구: ${params.desire}`,
      `브랜드: ${params.brandName}`,
    ]
      .filter(Boolean)
      .join('\n'),
    '세로 9:16 숏폼 광고. 화면 내 텍스트·자막·로고 없음(자막은 후반 작업). 등장인물은 20대 이상 성인.',
    params.instructions
      ? `## 추가 요구사항 (위 지침과 충돌하면 이것을 우선하라)\n${params.instructions}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

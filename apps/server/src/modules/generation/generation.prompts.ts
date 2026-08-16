import type {
  OverlayColor,
  OverlayColorKey,
  OverlayFont,
} from '../../common/media/text-overlay';

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

export type AiTypoStyle = 'selected' | 'match_reference' | 'auto';

const AI_TYPO_FONT_NAMES: Record<OverlayFont, { name: string; category: string }> = {
  gothic: { name: '思源黑體 (Noto Sans TC)', category: 'sans-serif/gothic' },
  serif: { name: '思源宋體 (Noto Serif TC)', category: 'serif/Ming' },
  rounded: { name: 'jf 粉圓體', category: 'rounded' },
  kai: { name: '霞鶩文楷 (LXGW WenKai TC)', category: 'Kai/brush script' },
  yozai: { name: '悠哉體 (Yozai)', category: 'handwritten' },
  iansui: { name: '芫荽體 (Iansui)', category: 'neat handwritten' },
  genryu: { name: '源流明體 (GenRyuMin TC)', category: 'traditional decorative Ming' },
};

const AI_TYPO_COLOR_NAMES: Record<OverlayColorKey, string> = {
  white: 'white',
  black: 'black',
  gold: 'gold',
};

function buildAiTypographyColor(color: OverlayColor): string {
  if (color === 'auto') {
    return 'a text color that matches the reference typography or the image mood';
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `color ${color}`;
  return `color ${AI_TYPO_COLOR_NAMES[color as OverlayColorKey]}`;
}

export function buildAiTypographyStyle(params: {
  style: AiTypoStyle;
  font: OverlayFont;
  color: OverlayColor;
}): string {
  const color = buildAiTypographyColor(params.color);
  if (params.style === 'match_reference') {
    return `Match the typeface style and arrangement of the TYPOGRAPHY reference image, ${color}`;
  }
  if (params.style === 'auto') {
    return `Choose the typeface that best fits the image's mood, ${color}`;
  }
  const font = AI_TYPO_FONT_NAMES[params.font];
  return `${font.name} family (${font.category}) feel, ${color}`;
}

export function buildImagePrompt(params: {
  count?: number;
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
  copyInfluence?: 'SCENE' | 'TEXT_ONLY';
  typography?: { headline: string; subline?: string | null; style: string };
  instructions?: string;
  hasReferences?: boolean;
}): string {
  const brandLine = `${params.brandName}${params.brandDescription ? ` — ${params.brandDescription}` : ''}`;
  const count = params.count ?? 1;
  return [
    [
      params.copyInfluence === 'TEXT_ONLY'
        ? `Create ${count} ad image draft(s) for a mobile feed ad. Build the scene ONLY from the attached reference images and the user requirement below — do NOT derive the scene, props or setting from any ad copy or campaign strategy. ${params.typography ? 'The only text in the image must be the text specified in the "TEXT LAYER" section at the end.' : 'Reserve clean space for a text overlay that will be added separately.'}`
        : `Create ${count} ad image draft(s) for a mobile feed ad. Render the brief below as one concrete moment and scene — not abstract concepts. Expression, body language and the space itself must tell the story.${params.hasReferences ? ' The attached reference images define the desired look — match them closely.' : ''}`,
    ]
      .filter(Boolean)
      .join('\n'),
    params.copyInfluence === 'TEXT_ONLY'
      ? `## Product\nBrand: ${params.brandName}`
      : `## Product\nBrand: ${brandLine}`,
    // TEXT_ONLY에선 브리프를 통째로 뺀다 — 타깃 문장('SF 스릴러')만 남겨도 무드가 장면으로 샜다 (운영 실측)
    params.copyInfluence === 'TEXT_ONLY'
      ? null
      : [
          '## Ad strategy (this emotion and situation must be visible in the image)',
          params.brief.audienceHypothesis
            ? `Target audience: ${params.brief.audienceHypothesis}`
            : null,
          `Core desire: ${params.brief.desire}`,
          `Hook type: ${params.brief.hookType}`,
          params.brief.messageAngle ? `Message angle: ${params.brief.messageAngle}` : null,
          `Visual format: ${params.brief.visualFormat}`,
        ]
          .filter(Boolean)
          .join('\n'),
    params.copyInfluence !== 'TEXT_ONLY' && params.creative
      ? [
          '## Approved ad copy (the image must depict the moment this copy describes)',
          `Korean: ${params.creative.koreanText}`,
          params.creative.approvedZhTw
            ? `zh-TW (approved): ${params.creative.approvedZhTw}`
            : null,
        ]
          .filter(Boolean)
          .join('\n')
      : null,
    [
      '## Art direction',
      params.hasReferences
        ? '- Lighting, color, texture and rendering must follow the attached reference images — do not default to photorealism.'
        : '- Define specific lighting, color and texture (for example: cool blue pre-dawn tones with screen glow, shallow depth of field and film grain).',
      params.hasReferences
        ? '- If people appear, they must be adults aged 20 or older.'
        : '- If people appear, they must be adults aged 20 or older; make a Taiwan urban-life context feel natural.',
      params.copyInfluence === 'TEXT_ONLY'
        ? null
        : '- If showing a smartphone screen, use a generalized chat UI rather than reproducing any specific app.',
    ].join('\n'),
    [
      '## Prohibited',
      '- No text, letters, logos or watermarks unless explicitly instructed below.',
      params.typography ? null : '- Leave clear empty space for copy to be composited later.',
      '- No minors or school settings.',
      '- No distorted hands or anatomy.',
    ]
      .filter(Boolean)
      .join('\n'),
    params.instructions
      ? `## User requirement (may be written in Korean — follow it precisely; it overrides any conflicting direction above)\n${params.instructions}`
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

export type GenerationReference = {
  key: string;
  roles?: Array<'CHARACTER' | 'STYLE' | 'TYPOGRAPHY'>;
  role?: 'CHARACTER' | 'STYLE' | 'TYPOGRAPHY';
};

type ReferenceRole = 'CHARACTER' | 'STYLE' | 'TYPOGRAPHY';

const REFERENCE_ROLE_INSTRUCTIONS: Record<ReferenceRole, string> = {
  CHARACTER:
    'Put this exact character into the new scene. Preserve identical facial features, hairstyle and length, body type, outfit style and overall art finish so it reads as the same person from the same artwork. Sample colors directly from the reference and keep them identical: iris color and its highlights, hair color value and saturation, skin tone, and the overall brightness and contrast of the character. Any color or value drift is an error.',
  STYLE:
    "Replicate this image's look almost exactly — the art style, line and shading technique, rendering finish, color palette, lighting and mood. If it shows an environment or background, recreate that same environment in the new scene. The output should look like it was made by the same artist for the same series.",
  TYPOGRAPHY:
    'Match the typography feel (typeface style, weight, arrangement) of the text in this image.',
};

export function appendReferences(prompt: string, references: GenerationReference[]): string {
  if (references.length === 0) return prompt;

  const roleInstructions = references.map((reference, index) => {
    const roles = Array.from(new Set(reference.roles ?? [reference.role ?? 'STYLE']));
    return `Reference #${index + 1} — ${roles.join(' + ')}: ${roles
      .map((role) => REFERENCE_ROLE_INSTRUCTIONS[role])
      .join(' ')} Do not copy this image's literal text content or logos.`;
  });

  return [
    prompt,
    [
      `## Attached reference images (${references.length}) — PRIMARY visual specification`,
      'References are attached in the order listed. They define what the output must look like. If anything above (art direction, composition guidance, examples) conflicts with a reference, the reference wins — including realism vs. anime. Only the "User requirement" section outranks the references.',
      ...roleInstructions,
      '## Reference keys (tracking only)',
      ...references.map((reference) => `- ${reference.key}`),
    ].join('\n'),
  ].join('\n\n');
}

/** AI 타이포 문구 렌더 지시 — 프롬프트 '맨 끝'(참조 뒤)에 붙인다.
 * 문구 전문이 장면 계획부에 섞이면 그 의미(경보등 등)가 장면으로 샌다 (운영 실측). */
export function buildTypographySection(typography: {
  headline: string;
  subline?: string | null;
  style: string;
}): string {
  return [
    '## TEXT LAYER — render these exact glyphs on top of the finished scene (accurate Traditional Chinese strokes)',
    "This text is a graphic layer only. Its meaning is IRRELEVANT to the scene — do not depict any object, place or event mentioned in it.",
    `Headline: "${typography.headline}"`,
    typography.subline ? `Subline: "${typography.subline}"` : null,
    `Typography style: ${typography.style}`,
    '- Size the text so the ENTIRE string fits comfortably inside the frame — prefer a smaller text size over any cropping or overflow.',
    '- Do not render any other text, logos or watermarks.',
  ]
    .filter(Boolean)
    .join('\n');
}

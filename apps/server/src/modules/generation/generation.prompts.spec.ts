import {
  appendReferences,
  buildAiTypographyStyle,
  buildImagePrompt,
} from './generation.prompts';

describe('image generation prompt', () => {
  it('keeps the default SCENE prompt byte-for-byte identical', () => {
    const prompt = buildImagePrompt({
      count: 2,
      brief: {
        audienceHypothesis: '스토리 몰입을 원하는 성인',
        desire: '주인공이 되고 싶은 욕구',
        hookType: '호기심 자극',
        messageAngle: '나만의 이야기',
        visualFormat: '세로형 캐릭터 클로즈업',
      },
      brandName: 'BabeChat',
      brandDescription: 'AI 캐릭터챗',
      creative: {
        koreanText: '오늘 밤, 내 이야기에 빠져봐',
        approvedZhTw: '今晚，沉浸在我的故事裡',
      },
    });

    expect(prompt).toBe(`Create 2 ad image draft(s) for a mobile feed ad. Render the brief below as one concrete moment and scene — not abstract concepts. Expression, hands, device screens and the space itself must tell the story.

## Product
Brand: BabeChat — AI 캐릭터챗

## Ad strategy (this emotion and situation must be visible in the image)
Target audience: 스토리 몰입을 원하는 성인
Core desire: 주인공이 되고 싶은 욕구
Hook type: 호기심 자극
Message angle: 나만의 이야기
Visual format: 세로형 캐릭터 클로즈업

## Approved ad copy (the image must depict the moment this copy describes)
Korean: 오늘 밤, 내 이야기에 빠져봐
zh-TW (approved): 今晚，沉浸在我的故事裡

## Art direction
- Define specific lighting, color and texture (for example: cool blue pre-dawn tones with screen glow, shallow depth of field and film grain).
- If people appear, they must be adults aged 20 or older; make a Taiwan urban-life context feel natural.
- If showing a smartphone screen, use a generalized chat UI rather than reproducing any specific app.

## Prohibited
- No text, letters, logos or watermarks unless explicitly instructed below.
- Leave clear empty space for copy to be composited later.
- No minors or school settings.
- No distorted hands or anatomy.`);
  });

  it('omits approved copy and adds the clean-overlay instruction in TEXT_ONLY mode', () => {
    const prompt = buildImagePrompt({
      brief: { desire: '몰입', hookType: '호기심', visualFormat: '인물 중심' },
      brandName: 'BabeChat',
      creative: {
        koreanText: '전쟁터에서 승리하는 장면',
        approvedZhTw: '在戰場上獲勝的場景',
      },
      copyInfluence: 'TEXT_ONLY',
    } as never);

    expect(prompt).toContain(
      'Do NOT derive the scene, props or setting from any ad copy or campaign strategy. Build the scene ONLY from the attached reference images and the user requirement below. Reserve clean space for a text overlay that will be added separately.',
    );
    expect(prompt).not.toContain('## Approved ad copy');
    expect(prompt).not.toContain('전쟁터에서 승리하는 장면');
    expect(prompt).not.toContain('在戰場上獲勝的場景');
    expect(prompt).toContain('## Campaign context (tone and casting only');
    expect(prompt).not.toContain('## Ad strategy');
    expect(prompt).not.toContain('Core desire:');
    expect(prompt).not.toContain('Visual format:');
  });

  it('keeps only the Text to render copy in AI typography plus TEXT_ONLY mode', () => {
    const prompt = buildImagePrompt({
      brief: { desire: '몰입', hookType: '호기심', visualFormat: '인물 중심' },
      brandName: 'BabeChat',
      creative: {
        koreanText: '전쟁터에서 승리하는 장면',
        approvedZhTw: '在戰場上獲勝的場景',
      },
      typography: {
        headline: '戰場上的智慧女神',
        subline: '立即開始聊天',
        style: 'gold serif',
      },
      copyInfluence: 'TEXT_ONLY',
    } as never);

    expect(prompt).toContain(
      'Do NOT derive the scene, props or setting from any ad copy or campaign strategy. Build the scene ONLY from the attached reference images and the user requirement below. The only text in the image must be the text specified in the "Text to render" section below.',
    );
    expect(prompt).not.toContain('## Approved ad copy');
    expect(prompt).not.toContain('전쟁터에서 승리하는 장면');
    expect(prompt).not.toContain('在戰場上獲勝的場景');
    expect(prompt).toContain('## Text to render inside the image');
    expect(prompt).toContain('Headline: "戰場上的智慧女神"');
    expect(prompt).toContain('Subline: "立即開始聊天"');
    expect(prompt).not.toContain('Reserve clean space for a text overlay');
  });

  it('uses an English AI typography frame while preserving exact rendered characters', () => {
    const prompt = buildImagePrompt({
      brief: { desire: '몰입', hookType: '호기심', visualFormat: '인물 중심' },
      brandName: 'BabeChat',
      typography: {
        headline: '戰場上的智慧女神',
        subline: '立即開始聊天',
        style: buildAiTypographyStyle({ style: 'selected', font: 'serif', color: 'gold' }),
      },
    });

    expect(prompt).toContain(
      '## Text to render inside the image (exactly these characters, with accurate Traditional Chinese strokes)',
    );
    expect(prompt).toContain('Headline: "戰場上的智慧女神"');
    expect(prompt).toContain('Subline: "立即開始聊天"');
    expect(prompt).toContain(
      'Typography style: 思源宋體 (Noto Serif TC) family (serif/Ming) feel, color gold',
    );
  });

  it('preserves a Korean user requirement verbatim inside the English override frame', () => {
    const requirement = '분홍색 네온 조명, 글자 금지';
    const prompt = buildImagePrompt({
      brief: { desire: '몰입', hookType: '호기심', visualFormat: '인물 중심' },
      brandName: 'BabeChat',
      instructions: requirement,
    });

    expect(prompt).toContain(
      `## User requirement (may be written in Korean — follow it precisely; it overrides any conflicting direction above)\n${requirement}`,
    );
  });

  it.each([
    [
      'CHARACTER' as const,
      "Reference #1 — CHARACTER: Put this exact character into the new scene. Preserve identical facial features, hairstyle and length, eye color, body type and overall art finish so it reads as the same person. Do not copy this image's composition, text content or logos.",
    ],
    [
      'STYLE' as const,
      "Reference #1 — STYLE: Match this image's art style, rendering finish, color palette and mood. Do not copy this image's characters, composition, text content or logos.",
    ],
    [
      'TYPOGRAPHY' as const,
      "Reference #1 — TYPOGRAPHY: Match the typography feel (typeface style, weight, arrangement) of the text in this image. Do not copy this image's characters, text content or logos.",
    ],
  ])('adds the distinct %s reference instruction', (role, instruction) => {
    const prompt = appendReferences('BASE PROMPT', [{ key: `refs/${role}.png`, role }]);

    expect(prompt).toContain(
      '## Attached reference images (1)\nReferences are attached in the order listed. Use each ONLY for its stated purpose.',
    );
    expect(prompt).toContain(instruction);
    expect(prompt).toContain(`## Reference keys (tracking only)\n- refs/${role}.png`);
  });

  it('lets character and style references override conflicting art direction', () => {
    const prompt = appendReferences('BASE PROMPT', [
      { key: 'refs/character.png', role: 'CHARACTER' },
      { key: 'refs/style.png', role: 'STYLE' },
    ]);

    expect(prompt).toContain(
      'When any CHARACTER or STYLE reference conflicts with the art direction above, the reference wins (including realism vs. anime).',
    );
  });

  it('returns the original prompt byte-for-byte when there are no references', () => {
    const prompt = 'BASE PROMPT\n원문 그대로';

    expect(appendReferences(prompt, [])).toBe(prompt);
  });

  it('combines all roles for one reference while forbidding text content and logos', () => {
    const prompt = appendReferences('BASE PROMPT', [
      {
        key: 'refs/all-roles.png',
        roles: ['CHARACTER', 'STYLE', 'TYPOGRAPHY'],
      },
    ] as never);

    expect(prompt).toContain(
      'Reference #1 — CHARACTER + STYLE + TYPOGRAPHY: Put this exact character into the new scene. Preserve identical facial features, hairstyle and length, eye color, body type and overall art finish so it reads as the same person. Match this image\'s art style, rendering finish, color palette and mood. Match the typography feel (typeface style, weight, arrangement) of the text in this image. Do not copy this image\'s text content or logos.',
    );
  });
});

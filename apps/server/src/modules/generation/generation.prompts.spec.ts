import {
  appendReferences,
  buildAiTypographyStyle,
  buildImagePrompt,
} from './generation.prompts';

describe('image generation prompt', () => {
  it('builds the English scaffold while preserving source-language brief and copy values', () => {
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

    expect(prompt).toContain(
      'Create 2 ad image draft(s) for a mobile feed ad. Render the brief below as one concrete moment and scene — not abstract concepts. Expression, hands, device screens and the space itself must tell the story.',
    );
    expect(prompt).toContain('## Product\nBrand: BabeChat — AI 캐릭터챗');
    expect(prompt).toContain('## Ad strategy');
    expect(prompt).toContain('Target audience: 스토리 몰입을 원하는 성인');
    expect(prompt).toContain('Core desire: 주인공이 되고 싶은 욕구');
    expect(prompt).toContain('Hook type: 호기심 자극');
    expect(prompt).toContain('Message angle: 나만의 이야기');
    expect(prompt).toContain('Visual format: 세로형 캐릭터 클로즈업');
    expect(prompt).toContain(
      '## Approved ad copy (the image must depict the moment this copy describes)',
    );
    expect(prompt).toContain('Korean: 오늘 밤, 내 이야기에 빠져봐');
    expect(prompt).toContain('zh-TW (approved): 今晚，沉浸在我的故事裡');
    expect(prompt).toContain('## Art direction');
    expect(prompt).toContain('## Prohibited');
    expect(prompt).toContain('No minors or school settings.');
    expect(prompt).toContain('No distorted hands or anatomy.');
    expect(prompt).not.toContain('## 연출 지침');
    expect(prompt).not.toContain('## 금지');
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
      "Reference #1 — CHARACTER: Put this exact character into the new scene. Preserve identical facial features, hairstyle and length, eye color, body type and overall art finish so it reads as the same person. Do not copy this image's composition or any text in it.",
    ],
    [
      'STYLE' as const,
      "Reference #1 — STYLE: Match this image's art style, rendering finish, color palette and mood only. Do not copy its characters, composition or text.",
    ],
    [
      'TYPOGRAPHY' as const,
      'Reference #1 — TYPOGRAPHY: Match only the typography feel (typeface style, weight, arrangement) of the text in this image. Do not copy the actual words, characters or logos.',
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
});

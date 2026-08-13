import { buildImagePrompt } from './generation.prompts';

describe('image generation prompt', () => {
  it('leaves composition to the size preset and forbids every kind of rendered character', () => {
    const prompt = buildImagePrompt({
      brief: {
        desire: '몰입',
        hookType: '호기심',
        visualFormat: '인물 중심',
      },
      brandName: 'BabeChat',
    });

    expect(prompt).not.toContain('세로 9:16 모바일 화면을 상정한 구도');
    expect(prompt).toContain(
      '이미지 안에 어떤 문자도 그리지 마라 — 한글·한자·영문·숫자·타이포그래피·로고·워터마크 전부. 문구 자리는 빈 공간으로만 남겨라 (문구는 생성 후 별도 합성된다).',
    );
  });
});

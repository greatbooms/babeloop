import { MockTextGenerationProvider } from '../../providers/text/mock-text-generation.provider';
import { briefSchema, copyVariantsSchema, localizationSchema, videoScriptSchema } from './generation.schemas';

describe('Mock 출력 ↔ 생성 스키마 계약', () => {
  const mock = new MockTextGenerationProvider();

  it('creative-brief 힌트 출력은 briefSchema를 통과한다', async () => {
    const raw = await mock.generate({
      system: 's',
      prompt: '대만 로맨스 브리프',
      responseHint: 'creative-brief',
    });
    expect(briefSchema.safeParse(JSON.parse(raw)).success).toBe(true);
  });

  it('copy-variants 힌트는 요청 개수만큼 변형을 반환한다 (프롬프트의 "변형 N개" 파싱)', async () => {
    const raw = await mock.generate({
      system: 's',
      prompt: '변형 3개를 생성하라. 브리프: ...',
      responseHint: 'copy-variants',
    });
    const parsed = copyVariantsSchema.parse(JSON.parse(raw));
    expect(parsed.variants).toHaveLength(3);
    expect(parsed.variants[0].koreanText).toContain('[MOCK 문구 1]');
  });

  it('video-script 힌트 출력은 videoScriptSchema를 통과한다', async () => {
    const raw = await mock.generate({
      system: 's',
      prompt: '변형 2개, 15초 스크립트',
      responseHint: 'video-script',
    });
    const parsed = videoScriptSchema.parse(JSON.parse(raw));
    expect(parsed.variants).toHaveLength(2);
  });

  it('zh-tw-localization 힌트 출력은 localizationSchema를 통과하고 결정적이다', async () => {
    const input = {
      system: 's',
      prompt: '이번엔 네가 주인공이야',
      responseHint: 'zh-tw-localization' as const,
    };
    const a = JSON.parse(await mock.generate(input));
    const b = JSON.parse(await mock.generate(input));
    expect(localizationSchema.safeParse(a).success).toBe(true);
    expect(a.zhTw).toContain('[MOCK zh-TW]');
    expect(a).toEqual(b);
  });

  it('힌트 없으면 기존 분석 형태 (하위 호환)', async () => {
    const raw = await mock.generate({ system: 's', prompt: 'x' });
    expect(JSON.parse(raw).summary).toBeDefined();
  });
});

import { createHash } from 'crypto';
import { TextGenerationInput, TextGenerationProvider } from './text-generation.provider';

const HOOK_TYPES = ['질문형', '캐릭터 대사형', '채팅 알림형', '후기형'];
const CTA_TYPES = ['무료 시작', '캐릭터 만나기', '앱 설치'];
const AUDIENCES = ['로맨스 선호 성인 여성', '창작형 사용자', '롤플레이 사용자'];
const TRIGGERS = ['설렘', '몰입', '호기심', '외로움 해소'];
const GENRES = ['로맨스', '판타지', '이세계'];
const DESIRES = ['나를 이해하는 캐릭터', '이야기 속 주인공이 되는 경험', '자유로운 롤플레이'];
const ANGLES = ['감정 중심', '기능 중심', '비교형'];
const FORMATS = ['채팅 캡처', '웹툰 패널', '앱 화면 녹화'];

export class MockTextGenerationProvider implements TextGenerationProvider {
  readonly name = 'mock';
  readonly model = 'mock-text-1';

  async generate(input: TextGenerationInput): Promise<{ text: string }> {
    const h = createHash('sha256').update(input.prompt).digest();
    const pick = <T>(arr: T[], i: number) => arr[h[i] % arr.length];
    const countMatch = input.prompt.match(/변형\s*(\d+)\s*개/);
    const count = countMatch ? Number(countMatch[1]) : 3;

    switch (input.responseHint) {
      case 'media-insight':
        return { text: JSON.stringify({
          summary: `[MOCK 미디어 인사이트] ${input.prompt.slice(0, 40)}`,
          hookType: pick(HOOK_TYPES, 0), targetAudience: [pick(AUDIENCES, 2)],
          emotionalTriggers: [pick(TRIGGERS, 3)], genres: [pick(GENRES, 5)],
        }) };
      case 'creative-brief':
        return { text: JSON.stringify({
          title: `[MOCK 브리프] ${input.prompt.slice(0, 60)}`,
          audienceHypothesis: pick(AUDIENCES, 0),
          desire: pick(DESIRES, 1),
          hookType: pick(HOOK_TYPES, 2),
          messageAngle: pick(ANGLES, 3),
          visualFormat: pick(FORMATS, 4),
          callToAction: pick(CTA_TYPES, 5),
          rationale: `[MOCK 근거] 참조 패턴 기반: ${pick(TRIGGERS, 6)}`,
          zhTw: {
            title: `[MOCK 繁中 브리프] ${input.prompt.slice(0, 30)}`,
            audienceHypothesis: '[MOCK 繁中] 受眾',
            desire: '[MOCK 繁中] 欲望',
            hookType: '[MOCK 繁中] 鉤子',
            messageAngle: '[MOCK 繁中] 訊息角度',
            visualFormat: '[MOCK 繁中] 視覺形式',
            callToAction: '[MOCK 繁中] CTA',
            rationale: '[MOCK 繁中] 根據',
          },
        }) };
      case 'copy-variants':
        return { text: JSON.stringify({
          variants: Array.from({ length: count }, (_, i) => ({
            koreanText: `[MOCK 문구 ${i + 1}] ${pick(DESIRES, i)} — ${pick(HOOK_TYPES, i + 1)}`,
            hookType: pick(HOOK_TYPES, i + 1),
          })),
        }) };
      case 'video-script':
        return { text: JSON.stringify({
          variants: Array.from({ length: count }, (_, i) => ({
            durationSeconds: 15,
            hookType: pick(HOOK_TYPES, i + 1),
            scenes: [
              {
                seconds: 0,
                visual: `[MOCK 장면] ${pick(FORMATS, i)}`,
                dialogue: pick(DESIRES, i),
                caption: '첫 훅',
              },
              { seconds: 12, visual: '앱 로고', dialogue: '', caption: pick(CTA_TYPES, i) },
            ],
          })),
        }) };
      case 'zh-tw-localization':
        return { text: JSON.stringify({ zhTw: `[MOCK zh-TW] ${input.prompt.slice(0, 30)}`, notes: 'mock 번역' }) };
      case 'creative-analysis':
      default:
        return { text: JSON.stringify({
          summary: `[MOCK 분석] ${input.prompt.slice(0, 40)}`,
          hook: { text: input.prompt.slice(0, 20), type: pick(HOOK_TYPES, 0) },
          callToAction: { text: '免費開始', type: pick(CTA_TYPES, 1) },
          targetAudience: [pick(AUDIENCES, 2)],
          emotionalTriggers: [pick(TRIGGERS, 3), pick(TRIGGERS, 4)],
          genres: [pick(GENRES, 5)],
          language: 'zh-TW',
        }) };
    }
  }
}

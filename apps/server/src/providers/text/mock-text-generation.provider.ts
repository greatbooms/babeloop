import { createHash } from 'crypto';
import { TextGenerationInput, TextGenerationProvider } from './text-generation.provider';

const HOOK_TYPES = ['질문형', '캐릭터 대사형', '채팅 알림형', '후기형'];
const CTA_TYPES = ['무료 시작', '캐릭터 만나기', '앱 설치'];
const AUDIENCES = ['로맨스 선호 성인 여성', '창작형 사용자', '롤플레이 사용자'];
const TRIGGERS = ['설렘', '몰입', '호기심', '외로움 해소'];
const GENRES = ['로맨스', '판타지', '이세계'];

export class MockTextGenerationProvider implements TextGenerationProvider {
  readonly name = 'mock';
  readonly model = 'mock-text-1';

  async generate(input: TextGenerationInput): Promise<string> {
    const h = createHash('sha256').update(input.prompt).digest();
    const pick = <T>(arr: T[], i: number) => arr[h[i] % arr.length];
    return JSON.stringify({
      summary: `[MOCK 분석] ${input.prompt.slice(0, 40)}`,
      hook: { text: input.prompt.slice(0, 20), type: pick(HOOK_TYPES, 0) },
      callToAction: { text: '免費開始', type: pick(CTA_TYPES, 1) },
      targetAudience: [pick(AUDIENCES, 2)],
      emotionalTriggers: [pick(TRIGGERS, 3), pick(TRIGGERS, 4)],
      genres: [pick(GENRES, 5)],
      language: 'zh-TW',
    });
  }
}

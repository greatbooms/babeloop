# BabeLoop 슬라이스 3 (생성) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분석된 경쟁 광고 패턴 + 브랜드 정보를 RAG로 결합해 광고 브리프 생성 → 한국어 문구/영상 스크립트 변형 생성 → zh-TW 현지화 초안까지. 전부 Mock Provider로 동작.

**Architecture:** `creative-generation`·`localization` 큐 (스펙 §18). 브리프 생성은 focusText를 임베딩해 유사 광고를 벡터 검색으로 찾아 그 분석 결과를 프롬프트에 주입한다 (RAG — 슬라이스 2 `VectorSearchRepository` 재사용). 모든 생성은 Zod 검증 + repair (기존 `generateJsonWithRepair` 재사용). 상태 머신 전이는 슬라이스 4 — 이번 슬라이스는 `DRAFT` 상태 생성만.

**참조:** 설계 문서, 기존 코드 패턴 (슬라이스 2의 프로세서·모듈·테스트 구조를 그대로 따른다)

**설계 문서와의 차이 (YAGNI, 노트 필수):**
- `prompt_templates` 테이블 생략 — 프롬프트는 코드 상수 + 버전 문자열로 관리하고 `ai_execution_logs.promptVersion`과 생성물 행에 기록. 프롬프트 편집 UI가 생기는 시점에 테이블화.
- `generated_variants` 테이블 생략 — 변형 1개 = `generated_creatives` 1행 (`variantIndex` 컬럼). 브리프 1 : 변형 N 구조로 충분.

---

## 누적 환경 제약 (슬라이스 0~2 실측 — 반드시 지킬 것)

슬라이스 2 계획서의 9개 항목 전부 + 추가:

10. **외부 URL fetch는 반드시 `common/security/external-url.guard.ts`의 `downloadExternal`을 통과** (SSRF 관문). 이번 슬라이스에는 외부 fetch가 없어야 정상.
11. Testcontainers 통합 테스트는 샌드박스에서 실행 불가 — RED 확인 후 구현하고 건너뛴다. 단위 테스트(providers, zod)는 직접 실행 가능.
12. 모든 파일 작성 완료 시 wait 루프 없이 즉시 완료 보고로 종료.

---

## 파일 구조 (추가/변경)

```
prisma/schema.prisma                       # CreativeBrief, GeneratedCreative, LocalizationVersion
apps/server/src/
├── providers/text/
│   ├── text-generation.provider.ts        # TextGenerationInput.responseHint 추가
│   └── mock-text-generation.provider.ts   # responseHint별 분기 (결정적)
├── queues/
│   ├── queue.constants.ts                 # creative-generation·localization 큐, 잡 상수
│   ├── creative-generation.processor.ts   # generate-brief, generate-copy-variants
│   └── localization.processor.ts          # localize-zh-tw
├── modules/generation/
│   ├── generation.schemas.ts              # brief/copyVariants/videoScript/localization Zod
│   ├── generation.prompts.ts              # 프롬프트 상수 + 버전
│   ├── brief.models.ts, brief.inputs.ts
│   ├── brief.service.ts                   # 브리프·변형 잡 등록, RAG 컨텍스트 조립
│   ├── brief.resolver.ts
│   └── generation.module.ts
├── modules/creative-analysis/analysis.service.ts  # (변경 없음, 참조만)
├── queues/creative-analysis.processor.ts  # responseHint: 'creative-analysis' 전달 (1줄)
├── worker.module.ts, app.module.ts, generate-schema.ts
apps/server/src/modules/generation/generation.schemas.spec.ts   # mock 출력이 스키마 통과 검증
apps/server/test/generation-pipeline.e2e-spec.ts
apps/web/src/pages/BriefsPage.tsx
apps/web/src/App.tsx                       # /briefs 라우트 + 내비 "브리프"
e2e/slice3.spec.ts
```

---

### Task 1: Prisma 스키마 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 모델 추가**

`Brand`에 `briefs CreativeBrief[]`, `SourceAd`에는 관계 불필요(브리프가 id 배열로 참조 — 참조 광고 삭제에도 브리프는 남아야 함), `User`에 `createdBriefs CreativeBrief[]` 관계 추가:

```prisma
model CreativeBrief {
  id                 String              @id @default(cuid())
  title              String
  marketCode         String              @default("TW")
  locale             String              @default("zh-TW")
  audienceHypothesis String
  desire             String
  hookType           String
  messageAngle       String
  visualFormat       String
  callToAction       String
  rationale          String // 참조 패턴 근거 — 왜 이 브리프인가
  focusText          String? // RAG 검색에 쓴 입력
  sourceAdIds        String[] // 참조한 경쟁 광고 (스냅샷 — FK 아님)
  brandId            String?
  brand              Brand?              @relation(fields: [brandId], references: [id])
  raw                Json
  provider           String
  model              String
  promptVersion      String
  createdById        String?
  createdBy          User?               @relation(fields: [createdById], references: [id])
  createdAt          DateTime            @default(now())
  creatives          GeneratedCreative[]

  @@map("creative_briefs")
}

enum CreativeType {
  COPY
  VIDEO_SCRIPT
}

// 상태 머신 전이는 슬라이스 4에서 강제. 이번 슬라이스는 DRAFT 생성만.
enum CreativeStatus {
  DRAFT
  POLICY_CHECKED
  IN_REVIEW
  LOCALIZATION_APPROVED
  APPROVED
  EXPORTED
  REVISION_REQUESTED
  REJECTED
}

model GeneratedCreative {
  id            String                @id @default(cuid())
  briefId       String
  brief         CreativeBrief         @relation(fields: [briefId], references: [id], onDelete: Cascade)
  type          CreativeType
  status        CreativeStatus        @default(DRAFT)
  variantIndex  Int
  hookType      String?
  koreanText    String // 한국어 원문 (스크립트는 장면 텍스트 직렬화본)
  scenes        Json? // VIDEO_SCRIPT: [{seconds, visual, dialogue, caption}]
  raw           Json
  provider      String
  model         String
  promptVersion String
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt
  localizations LocalizationVersion[]

  @@index([briefId])
  @@index([status])
  @@map("generated_creatives")
}

enum LocalizationKind {
  AI_DRAFT
  HUMAN_REVISED
  APPROVED
}

model LocalizationVersion {
  id         String            @id @default(cuid())
  creativeId String
  creative   GeneratedCreative @relation(fields: [creativeId], references: [id], onDelete: Cascade)
  locale     String            @default("zh-TW")
  kind       LocalizationKind
  text       String
  notes      String?
  reviewerId String?
  reviewer   User?             @relation(fields: [reviewerId], references: [id])
  provider   String?
  model      String?
  createdAt  DateTime          @default(now())

  @@index([creativeId])
  @@map("localization_versions")
}
```

`User`에 `localizationReviews LocalizationVersion[]` 관계도 추가.

- [ ] **Step 2: 마이그레이션**

Run: `pnpm prisma migrate dev --name slice3-generation`
Expected: 적용 성공

- [ ] **Step 3: Commit** (Codex는 건너뜀)

```bash
git add prisma/
git commit -m "feat: CreativeBrief·GeneratedCreative·LocalizationVersion 스키마"
```

---

### Task 2: TextGenerationProvider에 responseHint + Mock 분기

**Files:**
- Modify: `apps/server/src/providers/text/text-generation.provider.ts`, `mock-text-generation.provider.ts`, `apps/server/src/queues/creative-analysis.processor.ts`
- Create: `apps/server/src/modules/generation/generation.schemas.ts`, `generation.schemas.spec.ts`

- [ ] **Step 1: 인터페이스 확장**

`text-generation.provider.ts`의 `TextGenerationInput`에 추가:
```typescript
export type ResponseHint =
  | 'creative-analysis'
  | 'creative-brief'
  | 'copy-variants'
  | 'video-script'
  | 'zh-tw-localization';

export interface TextGenerationInput {
  system: string;
  prompt: string;
  /** 실제 Provider에서는 structured output 스키마 선택에, Mock에서는 응답 형태 분기에 사용 */
  responseHint?: ResponseHint;
}
```

- [ ] **Step 2: Zod 스키마 작성**

`generation.schemas.ts`:
```typescript
import { z } from 'zod';

export const GENERATION_PROMPT_VERSIONS = {
  brief: 'generate-brief@v1',
  copyVariants: 'generate-copy-variants@v1',
  videoScript: 'generate-video-script@v1',
  localizeZhTw: 'localize-zh-tw@v1',
} as const;

export const briefSchema = z.object({
  title: z.string().min(1),
  audienceHypothesis: z.string().min(1),
  desire: z.string().min(1),
  hookType: z.string().min(1),
  messageAngle: z.string().min(1),
  visualFormat: z.string().min(1),
  callToAction: z.string().min(1),
  rationale: z.string().min(1),
});

export const copyVariantsSchema = z.object({
  variants: z
    .array(z.object({ koreanText: z.string().min(1), hookType: z.string().min(1) }))
    .min(1),
});

export const videoScriptSchema = z.object({
  variants: z
    .array(
      z.object({
        durationSeconds: z.number().positive(),
        hookType: z.string().min(1),
        scenes: z
          .array(
            z.object({
              seconds: z.number().nonnegative(),
              visual: z.string().min(1),
              dialogue: z.string(),
              caption: z.string(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export const localizationSchema = z.object({
  zhTw: z.string().min(1),
  notes: z.string().optional(),
});
```

- [ ] **Step 3: 실패하는 테스트 작성 — Mock 출력이 각 스키마를 통과하는지**

`generation.schemas.spec.ts`:
```typescript
import { MockTextGenerationProvider } from '../../providers/text/mock-text-generation.provider';
import { briefSchema, copyVariantsSchema, localizationSchema, videoScriptSchema } from './generation.schemas';

describe('Mock 출력 ↔ 생성 스키마 계약', () => {
  const mock = new MockTextGenerationProvider();

  it('creative-brief 힌트 출력은 briefSchema를 통과한다', async () => {
    const raw = await mock.generate({ system: 's', prompt: '대만 로맨스 브리프', responseHint: 'creative-brief' });
    expect(briefSchema.safeParse(JSON.parse(raw)).success).toBe(true);
  });

  it('copy-variants 힌트는 요청 개수만큼 변형을 반환한다 (프롬프트의 "변형 N개" 파싱)', async () => {
    const raw = await mock.generate({ system: 's', prompt: '변형 3개를 생성하라. 브리프: ...', responseHint: 'copy-variants' });
    const parsed = copyVariantsSchema.parse(JSON.parse(raw));
    expect(parsed.variants).toHaveLength(3);
    expect(parsed.variants[0].koreanText).toContain('[MOCK 문구 1]');
  });

  it('video-script 힌트 출력은 videoScriptSchema를 통과한다', async () => {
    const raw = await mock.generate({ system: 's', prompt: '변형 2개, 15초 스크립트', responseHint: 'video-script' });
    const parsed = videoScriptSchema.parse(JSON.parse(raw));
    expect(parsed.variants).toHaveLength(2);
  });

  it('zh-tw-localization 힌트 출력은 localizationSchema를 통과하고 결정적이다', async () => {
    const input = { system: 's', prompt: '이번엔 네가 주인공이야', responseHint: 'zh-tw-localization' as const };
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
```

- [ ] **Step 4: 실패 확인**

Run: `pnpm --filter @babeloop/server test -- generation.schemas`
Expected: FAIL

- [ ] **Step 5: Mock 분기 구현**

`mock-text-generation.provider.ts`를 확장 — 기존 분석 출력은 default 분기로 유지:
```typescript
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

  async generate(input: TextGenerationInput): Promise<string> {
    const h = createHash('sha256').update(input.prompt).digest();
    const pick = <T>(arr: T[], i: number) => arr[h[i] % arr.length];
    const countMatch = input.prompt.match(/변형\s*(\d+)\s*개/);
    const count = countMatch ? Number(countMatch[1]) : 3;

    switch (input.responseHint) {
      case 'creative-brief':
        return JSON.stringify({
          title: `[MOCK 브리프] ${input.prompt.slice(0, 24)}`,
          audienceHypothesis: pick(AUDIENCES, 0),
          desire: pick(DESIRES, 1),
          hookType: pick(HOOK_TYPES, 2),
          messageAngle: pick(ANGLES, 3),
          visualFormat: pick(FORMATS, 4),
          callToAction: pick(CTA_TYPES, 5),
          rationale: `[MOCK 근거] 참조 패턴 기반: ${pick(TRIGGERS, 6)}`,
        });
      case 'copy-variants':
        return JSON.stringify({
          variants: Array.from({ length: count }, (_, i) => ({
            koreanText: `[MOCK 문구 ${i + 1}] ${pick(DESIRES, i)} — ${pick(HOOK_TYPES, i + 1)}`,
            hookType: pick(HOOK_TYPES, i + 1),
          })),
        });
      case 'video-script':
        return JSON.stringify({
          variants: Array.from({ length: count }, (_, i) => ({
            durationSeconds: 15,
            hookType: pick(HOOK_TYPES, i + 1),
            scenes: [
              { seconds: 0, visual: `[MOCK 장면] ${pick(FORMATS, i)}`, dialogue: pick(DESIRES, i), caption: '첫 훅' },
              { seconds: 12, visual: '앱 로고', dialogue: '', caption: pick(CTA_TYPES, i) },
            ],
          })),
        });
      case 'zh-tw-localization':
        return JSON.stringify({ zhTw: `[MOCK zh-TW] ${input.prompt.slice(0, 30)}`, notes: 'mock 번역' });
      case 'creative-analysis':
      default:
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
}
```

`creative-analysis.processor.ts`의 `generateJsonWithRepair` 호출에 `responseHint: 'creative-analysis'` 추가.

- [ ] **Step 6: 통과 확인 + 기존 회귀**

Run: `pnpm --filter @babeloop/server test -- generation.schemas` → PASS 5건
Run: `pnpm --filter @babeloop/server test -- generate-json-with-repair` → 기존 PASS 유지

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat: TextGeneration responseHint와 생성 스키마 4종 (Mock 분기)"
```

---

### Task 3: 큐 상수 + 프롬프트 상수

**Files:**
- Modify: `apps/server/src/queues/queue.constants.ts`
- Create: `apps/server/src/modules/generation/generation.prompts.ts`

- [ ] **Step 1: 큐 상수 추가**

```typescript
export const CREATIVE_GENERATION_QUEUE = 'creative-generation';
export const LOCALIZATION_QUEUE = 'localization';

// JOB_TYPES에 추가:
//   GENERATE_BRIEF: 'generate-brief',
//   GENERATE_COPY_VARIANTS: 'generate-copy-variants',
//   LOCALIZE_ZH_TW: 'localize-zh-tw',

// 브리프·변형 생성은 사용자가 반복 실행할 수 있으므로 uuid 포함 (중복 차단 아님, 추적용)
export function generateBriefJobId(requestId: string): string {
  return `${JOB_TYPES.GENERATE_BRIEF}--${requestId}`;
}
export function generateCopyVariantsJobId(briefId: string, requestId: string): string {
  return `${JOB_TYPES.GENERATE_COPY_VARIANTS}--${briefId}--${requestId}`;
}
// 현지화는 크리에이티브당 idempotent
export function localizeZhTwJobId(creativeId: string): string {
  return `${JOB_TYPES.LOCALIZE_ZH_TW}--${creativeId}`;
}
```

- [ ] **Step 2: 프롬프트 상수 작성**

`generation.prompts.ts`:
```typescript
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
    `위 정보로 대만(zh-TW) 시장용 광고 브리프 1개를 생성하라.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildVariantsPrompt(params: { briefSummary: string; count: number; type: 'COPY' | 'VIDEO_SCRIPT' }): string {
  const what = params.type === 'COPY' ? '광고 문구' : '15초 영상 스크립트';
  return `다음 브리프로 ${what} 변형 ${params.count}개를 생성하라.\n\n## 브리프\n${params.briefSummary}`;
}

export function buildLocalizePrompt(koreanText: string): string {
  return `다음 한국어 광고 문구를 번체중문으로 현지화하라:\n${koreanText}`;
}
```

- [ ] **Step 3: 컴파일 확인 → Commit**

```bash
git add apps/server
git commit -m "feat: 생성·현지화 큐 상수와 프롬프트 v1"
```

---

### Task 4: 브리프 GraphQL (모듈·서비스·리졸버)

**Files:**
- Create: `apps/server/src/modules/generation/brief.models.ts`, `brief.inputs.ts`, `brief.service.ts`, `brief.resolver.ts`, `generation.module.ts`
- Modify: `app.module.ts`, `generate-schema.ts`

- [ ] **Step 1: 모델·인풋 작성**

`brief.models.ts` — GraphQL ObjectType들 (Prisma 필드 그대로): `CreativeBriefModel`(전 필드 + `creatives: [GeneratedCreativeModel]`), `GeneratedCreativeModel`(id, type, status, variantIndex, hookType, koreanText, scenes(Json→`GraphQLJSON`은 쓰지 않고 `String`으로 직렬화 노출 — `@Field(() => String, {nullable:true}) scenesJson`), localizations: `[LocalizationVersionModel]`), `LocalizationVersionModel`(id, locale, kind, text, notes, createdAt), `GenerateJobPayload`(job: JobModel). enum 등록: `CreativeType`, `CreativeStatus`, `LocalizationKind`.

scenes 노출 방식: 모델에 `@Field(() => String, { nullable: true }) scenesJson: string | null`을 두고 리졸버/서비스에서 `scenes ? JSON.stringify(scenes) : null` 매핑 (graphql-type-json 의존성 추가하지 않음).

`brief.inputs.ts`:
```typescript
@InputType()
export class GenerateCreativeBriefInput {
  @Field(() => String, { nullable: true }) title?: string;
  @Field(() => String, { nullable: true }) focusText?: string;
  @Field(() => ID, { nullable: true }) brandId?: string;
  @Field(() => [ID], { nullable: true }) sourceAdIds?: string[];
}

@InputType()
export class GenerateCreativeVariantsInput {
  @Field(() => ID) briefId: string;
  @Field(() => CreativeType) type: CreativeType;
  @Field(() => Int, { nullable: true, defaultValue: 3 }) count: number;
}
```

- [ ] **Step 2: 서비스 작성**

`brief.service.ts` 핵심 — 잡 등록만 하고 실제 생성은 워커:
```typescript
@Injectable()
export class BriefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobRecord: JobRecordService,
    @InjectQueue(CREATIVE_GENERATION_QUEUE) private readonly queue: Queue,
  ) {}

  async requestBrief(user: User, input: GenerateCreativeBriefInput) {
    if (!input.focusText && (!input.sourceAdIds || input.sourceAdIds.length === 0)) {
      throw new GraphQLError('focusText 또는 sourceAdIds 중 하나는 필요합니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const requestId = randomUUID();
    const jobId = generateBriefJobId(requestId);
    const payload = {
      title: input.title ?? null,
      focusText: input.focusText ?? null,
      brandId: input.brandId ?? null,
      sourceAdIds: input.sourceAdIds ?? [],
      createdById: user.id,
    };
    await this.queue.add(JOB_TYPES.GENERATE_BRIEF, payload, {
      jobId, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: false,
    });
    const job = await this.jobRecord.enqueue(jobId, CREATIVE_GENERATION_QUEUE, JOB_TYPES.GENERATE_BRIEF, payload);
    return { job };
  }

  async requestVariants(input: GenerateCreativeVariantsInput) {
    await this.prisma.creativeBrief.findUniqueOrThrow({ where: { id: input.briefId } }).catch(() => {
      throw new GraphQLError('브리프를 찾을 수 없습니다', { extensions: { code: 'NOT_FOUND' } });
    });
    const jobId = generateCopyVariantsJobId(input.briefId, randomUUID());
    const payload = { briefId: input.briefId, type: input.type, count: input.count };
    await this.queue.add(JOB_TYPES.GENERATE_COPY_VARIANTS, payload, {
      jobId, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: false,
    });
    const job = await this.jobRecord.enqueue(jobId, CREATIVE_GENERATION_QUEUE, JOB_TYPES.GENERATE_COPY_VARIANTS, payload);
    return { job };
  }

  findAll() {
    return this.prisma.creativeBrief.findMany({ include: BRIEF_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async findById(id: string) { /* findUnique + include, 없으면 NotFoundException — 기존 패턴 */ }
}
```
`BRIEF_INCLUDE = { creatives: { orderBy: { variantIndex: 'asc' }, include: { localizations: { orderBy: { createdAt: 'desc' } } } } } as const`.

`brief.resolver.ts`: Query `creativeBriefs`, `creativeBrief(id)`; Mutation `generateCreativeBrief`(Roles ADMIN/EDITOR/REVIEWER), `generateCreativeVariants`(동일). `GenerationModule` imports: `AuthModule`(Guard용) + `BullModule.registerQueue({name: CREATIVE_GENERATION_QUEUE})`. **generate-schema.ts에 BriefResolver 추가.**

`scenesJson` 매핑은 서비스에서: `findAll`/`findById`가 반환 전에 `creatives`를 `{...c, scenesJson: c.scenes ? JSON.stringify(c.scenes) : null}`로 변환한다.

- [ ] **Step 3: 컴파일 확인 → Commit**

```bash
git add apps/server
git commit -m "feat: 브리프·변형 생성 GraphQL (잡 등록)"
```

---

### Task 5: creative-generation 프로세서 (브리프 RAG + 변형 생성)

**Files:**
- Create: `apps/server/src/queues/creative-generation.processor.ts`
- Modify: `worker.module.ts` (큐 3종 등록: creative-generation, localization + 프로세서)

- [ ] **Step 1: 구현**

```typescript
@Processor(CREATIVE_GENERATION_QUEUE)
export class CreativeGenerationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiLog: AiExecutionLogService,
    private readonly jobRecord: JobRecordService,
    private readonly vectors: VectorSearchRepository,
    @Inject(TEXT_GENERATION_PROVIDER) private readonly textAi: TextGenerationProvider,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
    @InjectQueue(LOCALIZATION_QUEUE) private readonly localizationQueue: Queue,
  ) { super(); }

  async process(job: BullJob): Promise<void> {
    if (job.name === JOB_TYPES.GENERATE_BRIEF) return this.generateBrief(job);
    if (job.name === JOB_TYPES.GENERATE_COPY_VARIANTS) return this.generateVariants(job);
    throw new Error(`알 수 없는 잡: ${job.name}`);
  }
  ...
}
```

`generateBrief` 핵심 로직:
1. `jobRecord.markRunning`
2. **RAG — 참조 광고 결정**: `sourceAdIds`가 있으면 그대로, 없으면 `focusText`를 `embedder.embed()` → `vectors.searchSimilar({vector, model: embedder.model, limit: 3})` → 그 sourceAdId들
3. 참조 광고의 최신 분석 로드: `prisma.creativeAnalysis.findMany({ where: { sourceAdId: { in: ids } }, orderBy: { createdAt: 'desc' } })` — sourceAdId별 첫 행만 사용. 분석이 하나도 없으면 `참조할 분석이 없습니다` 오류 (최종 시도에서 jobRecord.markFailed)
4. 패턴 텍스트 조립: 각 분석의 `hookType / targetAudience / emotionalTriggers / genres / summary`를 불릿 텍스트로
5. 브랜드 컨텍스트: brandId 있으면 features·guidelines 로드, 없으면 `'BabeChat — AI 캐릭터챗, 대만 시장'` 기본 문자열
6. `generateJsonWithRepair(textAi, { system: BRIEF_SYSTEM, prompt: buildBriefPrompt(...), responseHint: 'creative-brief' }, briefSchema)` — `aiLog.record`로 감싸고 `promptVersion: GENERATION_PROMPT_VERSIONS.brief`, `inputRef: 'brief-request:{jobId}'`
7. `creativeBrief.create` — title은 input.title 우선, 없으면 결과의 title. `sourceAdIds`, `focusText`, provider/model/promptVersion, raw
8. `jobRecord.markSucceeded(jobId, { briefId })` — UI는 job 완료 후 브리프 목록을 refetch하고(최신순 정렬), **통합 테스트만** DB의 job.result에서 briefId를 직접 읽는다 (JobModel GraphQL에는 result 필드가 없음 — 추가하지 말 것)

`generateVariants` 핵심 로직:
1. markRunning, 브리프 로드 (없으면 실패)
2. `briefSummary` = 브리프 필드들을 불릿 텍스트로
3. type별 분기:
   - COPY: `generateJsonWithRepair(..., { system: COPY_SYSTEM, prompt: buildVariantsPrompt({briefSummary, count, type}), responseHint: 'copy-variants' }, copyVariantsSchema)` → `variants.slice(0, count)` 각각 `generatedCreative.create({ type: 'COPY', variantIndex: i+1, hookType, koreanText, raw, provider/model/promptVersion: copyVariants })`
   - VIDEO_SCRIPT: `videoScriptSchema` + `responseHint: 'video-script'` → koreanText는 `scenes.map(s => `${s.seconds}s [${s.visual}] ${s.dialogue} (${s.caption})`).join('\n')`, `scenes` Json 저장, promptVersion: videoScript
4. 변형마다 현지화 잡 체인: `localizationQueue.add(JOB_TYPES.LOCALIZE_ZH_TW, { creativeId }, { jobId: localizeZhTwJobId(creativeId), ... })` + `jobRecord.enqueue`
5. `markSucceeded(jobId, { creativeIds })`

오류 처리: 슬라이스 2 프로세서와 동일 — 최종 시도에서만 markFailed, 항상 rethrow.

- [ ] **Step 2: worker.module.ts 등록**

`BullModule.registerQueue({ name: CREATIVE_GENERATION_QUEUE }, { name: LOCALIZATION_QUEUE })` 추가, `GenerationModule` 또는 프로세서 직접 providers 등록 (기존 프로세서 등록 방식 그대로), `TextModule`·`EmbeddingModule`은 이미 등록되어 있음.

- [ ] **Step 3: 컴파일 확인 → Commit**

```bash
git add apps/server
git commit -m "feat: 브리프 RAG 생성·변형 생성 프로세서 (현지화 잡 체인)"
```

---

### Task 6: localization 프로세서

**Files:**
- Create: `apps/server/src/queues/localization.processor.ts`
- Modify: `worker.module.ts`

- [ ] **Step 1: 구현**

```typescript
@Processor(LOCALIZATION_QUEUE)
export class LocalizationProcessor extends WorkerHost {
  // 의존성: prisma, aiLog, jobRecord, TEXT_GENERATION_PROVIDER
  async process(job: BullJob<{ creativeId: string }>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const creative = await this.prisma.generatedCreative.findUniqueOrThrow({ where: { id: job.data.creativeId } });
      const result = await this.aiLog.record(
        { provider: this.textAi.name, model: this.textAi.model, promptVersion: GENERATION_PROMPT_VERSIONS.localizeZhTw, inputRef: `creative:${creative.id}` },
        () => generateJsonWithRepair(
          this.textAi,
          { system: LOCALIZE_SYSTEM, prompt: buildLocalizePrompt(creative.koreanText), responseHint: 'zh-tw-localization' },
          localizationSchema,
        ),
      );
      // AI_DRAFT는 크리에이티브당 1개 유지 (재실행 시 교체)
      await this.prisma.localizationVersion.deleteMany({
        where: { creativeId: creative.id, locale: 'zh-TW', kind: 'AI_DRAFT' },
      });
      await this.prisma.localizationVersion.create({
        data: {
          creativeId: creative.id, locale: 'zh-TW', kind: 'AI_DRAFT',
          text: result.zhTw, notes: result.notes ?? null,
          provider: this.textAi.name, model: this.textAi.model,
        },
      });
      await this.jobRecord.markSucceeded(jobId);
    } catch (error) {
      // 기존 패턴: 최종 시도에서만 markFailed, rethrow
    }
  }
}
```

- [ ] **Step 2: 컴파일 확인 → Commit**

```bash
git add apps/server
git commit -m "feat: zh-TW 현지화 초안 프로세서 (AI_DRAFT 교체 방식)"
```

---

### Task 7: 파이프라인 통합 테스트

**Files:**
- Create: `apps/server/test/generation-pipeline.e2e-spec.ts`

- [ ] **Step 1: 테스트 작성** (Testcontainers — 샌드박스에서 실행 불가 시 작성만 하고 건너뜀)

시나리오 (loginAs·worker 컨텍스트·폴링 대기는 기존 테스트 패턴 그대로):
1. **준비**: EDITOR 로그인, 광고 1개 등록(`adText: '이야기의 주인공이 되는 경험'`) → ANALYZED 대기 (RAG 소스)
2. **브리프 RAG**: `generateCreativeBrief({focusText: '주인공이 되는 로맨스'})` → job.result의 briefId 폴링 대기 → `creativeBrief(id)` 조회: title이 `[MOCK 브리프]` 포함, `sourceAdIds`에 1번 광고 포함 (벡터 검색이 찾았다는 증거), rationale·hookType 등 필수 필드 존재
3. **변형 + 현지화 체인**: `generateCreativeVariants({briefId, type: COPY, count: 3})` → 완료 대기 → 크리에이티브 3개(variantIndex 1·2·3, koreanText `[MOCK 문구 N]`) → 각 크리에이티브의 `localizations`에 AI_DRAFT 1개(`[MOCK zh-TW]` 포함)가 생길 때까지 폴링 (15초)
4. **VIDEO_SCRIPT**: `generateCreativeVariants({briefId, type: VIDEO_SCRIPT, count: 2})` → scenes(Json) 저장 확인 (`scenesJson` 노출 확인은 GraphQL 조회로)
5. **감사 추적**: `ai_execution_logs`에 promptVersion `generate-brief@v1`·`generate-copy-variants@v1`·`localize-zh-tw@v1` 행 존재
6. **입력 검증**: focusText·sourceAdIds 둘 다 없이 브리프 요청 → BAD_USER_INPUT

- [ ] **Step 2: 실행**

Run: `pnpm --filter @babeloop/server test -- generation-pipeline`
Expected: PASS (로컬 Claude 검증 시)

- [ ] **Step 3: Commit**

```bash
git add apps/server/test
git commit -m "test: 브리프 RAG → 변형 → zh-TW 초안 파이프라인 통합 테스트"
```

---

### Task 8: 웹 — 브리프 페이지

**Files:**
- Create: `apps/web/src/pages/BriefsPage.tsx`
- Modify: `apps/web/src/App.tsx` (`/briefs` 라우트, 내비 "브리프" — 브랜드 | 미디어 | 광고 | 브리프)

- [ ] **Step 1: BriefsPage 작성** (SourceAdsPage 패턴 그대로)

GraphQL 문서: `CreativeBriefs`(목록: id title hookType desire callToAction createdAt + creatives{id variantIndex koreanText type status localizations{kind text}}), `GenerateCreativeBrief`, `GenerateCreativeVariants`, 그리고 잡 결과 폴링은 기존 `useJobPolling` 사용.

화면 구성:
- 브리프 생성 폼: 제목(선택) + **포커스 텍스트**(필수 입력으로 UI 단순화) → `generateCreativeBrief` → job 폴링 → SUCCEEDED 시 refetch
- 브리프 카드 목록: title / desire / hookType / CTA / rationale. 카드 안에 "문구 변형 3개 생성" 버튼 → `generateCreativeVariants({briefId, type: COPY, count: 3})` → job 폴링 → 완료 시 refetch (+2초 후 한 번 더 — 현지화 체인 보정, MediaPage 패턴)
- 변형 목록: `variantIndex. koreanText` + 그 아래 zh-TW 초안(`localizations`에서 kind AI_DRAFT의 text) 표시. 초안이 아직 없으면 "현지화 중…"
- enum은 `import { CreativeType } from '../generated/graphql'` 사용 (환경 제약 6)
- E2E가 의존하는 접근성 계약: 폼 label "포커스", 버튼 "브리프 생성", 버튼 "문구 변형 3개 생성", 브리프 카드는 `<li>`, 페이지 제목 `<h1>브리프</h1>`

- [ ] **Step 2: 빌드 확인**

Run: `pnpm --filter @babeloop/server schema:emit && pnpm --filter @babeloop/web build`
Expected: 성공

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat: 브리프 생성·변형·zh-TW 초안 화면"
```

---

### Task 9: E2E

**Files:**
- Create: `e2e/slice3.spec.ts`

- [ ] **Step 1: 작성**

```typescript
import { expect, test } from '@playwright/test';

test('브리프 생성 → 변형 3개 → zh-TW 초안 표시', async ({ page }) => {
  const stamp = Date.now();

  await page.goto('/');
  await page.getByLabel('이메일').fill('admin@babeloop.local');
  await page.getByLabel('비밀번호').fill('changeme-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  // RAG 소스: 광고 1개 등록하고 분석 완료까지 대기
  await page.getByRole('link', { name: '광고' }).click();
  await page.getByLabel('제목').fill(`RAG-${stamp}`);
  await page.getByLabel('광고 문구').fill(`이야기의 주인공이 되는 경험 ${stamp}`);
  await page.getByRole('button', { name: '광고 등록' }).click();
  const ragRow = page.locator('li', { hasText: `RAG-${stamp}` });
  await expect(ragRow.getByText('ANALYZED')).toBeVisible({ timeout: 30_000 });

  // 브리프 생성
  await page.getByRole('link', { name: '브리프' }).click();
  await expect(page.getByRole('heading', { name: '브리프', exact: true })).toBeVisible();
  await page.getByLabel('포커스').fill(`주인공이 되는 로맨스 ${stamp}`);
  await page.getByRole('button', { name: '브리프 생성' }).click();
  const briefCard = page.locator('li', { hasText: '[MOCK 브리프]' }).first();
  await expect(briefCard).toBeVisible({ timeout: 30_000 });

  // 변형 3개 + zh-TW 초안
  await briefCard.getByRole('button', { name: '문구 변형 3개 생성' }).click();
  await expect(briefCard.getByText('[MOCK 문구 1]')).toBeVisible({ timeout: 30_000 });
  await expect(briefCard.getByText('[MOCK 문구 3]')).toBeVisible({ timeout: 30_000 });
  await expect(briefCard.getByText('[MOCK zh-TW]').first()).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 2: 실행 확인**

Run: `pnpm e2e`
Expected: slice0~3 모두 passed

- [ ] **Step 3: Commit**

```bash
git add e2e
git commit -m "test: 슬라이스 3 완료 기준 E2E — 브리프·변형·zh-TW 초안"
```

---

## 슬라이스 3 완료 체크리스트

- [ ] 전체 서버 테스트 PASS + 클린 종료
- [ ] `pnpm e2e` — slice0~3 passed
- [ ] 브리프의 `sourceAdIds`에 벡터 검색으로 찾은 광고가 기록됨 (RAG 증거)
- [ ] 변형 생성 → 현지화 잡 자동 체인 → AI_DRAFT 저장 (재실행 시 교체)
- [ ] `ai_execution_logs`에 3종 promptVersion 기록
- [ ] VIDEO_SCRIPT 타입도 scenes와 함께 생성됨 (통합 테스트)

## 다음 슬라이스 예고

슬라이스 4 (검토·내보내기): 상태 머신 강제(자기승인 금지·현지화 게이트), 검토 큐, BabeGuard 기본(유사도·금지어·미성년자 하드게이트 플래그), experiments/experiment_variants + 추적코드, 파일 내보내기.

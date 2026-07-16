# BabeLoop 슬라이스 4 (검토·내보내기) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 생성물의 상태 머신(자기승인 금지·현지화 게이트·미성년자 하드게이트)을 서버가 강제하고, BabeGuard 기본 검사 → 검토·승인 → 실험 배정 → 추적코드 각인 파일 내보내기까지. **이 슬라이스는 설계 문서 8·9장(상태 머신, BabeGuard)의 구현이다 — 해당 장을 먼저 읽을 것.**

**Architecture:** 모든 상태 전이는 `CreativeStateMachine` 서비스 하나를 통과한다 (UI가 아니라 서버가 막는다 — 설계 원칙). 정책 검사는 `policy-check` 큐. 미성년자 게이트는 **설정으로 끌 수 없는 하드코드**이며 AI 점수가 아니라 사람 서명으로만 해제된다 (설계 §9). 내보내기는 추적코드를 파일명·본문·manifest에 각인해 MinIO에 저장하고 presigned 링크를 제공한다 (설계 §7).

**설계 문서와의 차이 (노트 필수):**
- 추적코드 모듈은 `packages/shared`가 아니라 `apps/server/src/common/tracking-code.ts` — 웹은 코드를 표시만 하고 파싱하지 않으므로 아직 공유가 불필요하고, TS 소스 크로스패키지 임포트는 dist 레이아웃을 깨뜨린다(슬라이스 0의 Prisma Client 사고와 동일 계열). 웹에서 실제로 필요해지는 시점에 이동.
- 금지어·미성년 신호 키워드는 DB 테이블(`prohibited_terms`)이 아니라 코드 상수 — 편집 UI가 생기는 시점에 테이블화.
- 정합성 체크리스트(광고-도착지)는 이번 슬라이스에서 UI 없이 검수자 노트로 대체 — 게시 경로가 생기는 Phase 5에서 정식 구현.
- `review_requests` 테이블은 요청 레코드가 아니라 **검토 이벤트 로그**로 사용 (설계 §6 "이력은 이벤트 테이블로").

---

## 누적 환경 제약

슬라이스 3 계획서의 12개 항목 전부 동일하게 적용. 추가:

13. E2E 셀렉터는 반드시 해당 실행의 고유 토큰으로 카드를 특정한다 (dev DB에 이전 실행 데이터가 누적됨 — 슬라이스 3에서 실측). Mock 출력에 토큰이 잘리지 않는지 확인할 것.
14. 상태 전이·추적코드는 이 프로젝트의 척추다 — **단위 테스트를 먼저 쓰고(전이 매트릭스 전체), 구현은 테스트를 통과시키는 것으로 한다.** 이 두 영역은 통합 테스트로 대체 불가.

---

## 파일 구조 (추가/변경)

```
prisma/schema.prisma                  # GeneratedCreative 확장, PolicyCheck, ReviewRequest,
                                      # Experiment, ExperimentVariant, ExportPackage
prisma/seed.ts                        # REVIEWER 시드 계정 추가
apps/server/src/
├── common/tracking-code.ts (+spec)   # 추적코드 생성·파싱 (순수 함수)
├── modules/review/
│   ├── creative-state-machine.ts (+spec)  # 전이 테이블 + 가드 (순수 로직)
│   ├── review.models.ts, review.inputs.ts
│   ├── review.service.ts             # 전이 mutation들 + 검토 이벤트 기록
│   ├── review.resolver.ts
│   └── review.module.ts
├── modules/experiment/
│   ├── experiment.models.ts, .inputs.ts, .service.ts, .resolver.ts, .module.ts
│   └── export.service.ts             # 파일 생성·MinIO 저장·EXPORTED 전이
├── modules/policy/
│   ├── banned-terms.ts               # 금지어·미성년 신호 키워드 상수
│   └── policy-check.service.ts       # 검사 3종 로직 (프로세서가 호출)
├── queues/policy-check.processor.ts
├── queues/queue.constants.ts         # policy-check 큐
├── worker.module.ts, app.module.ts, generate-schema.ts
apps/server/test/review-flow.e2e-spec.ts
apps/web/src/pages/ReviewPage.tsx, ExperimentsPage.tsx
apps/web/src/App.tsx                  # /review, /experiments 라우트 + 내비
e2e/slice4.spec.ts
```

---

### Task 1: Prisma 스키마 + 시드 확장

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/seed.ts`

- [ ] **Step 1: GeneratedCreative 확장**

기존 모델에 컬럼 추가:
```prisma
  revision        Int      @default(1)
  createdById     String?
  lastEditedById  String?
  // 미성년자 하드게이트 — 설정으로 끌 수 없다. 해제는 사람 서명(releaseMinorFlag)만.
  minorFlagged    Boolean  @default(false)
  minorFlagNote   String?
  experimentVariants ExperimentVariant[]
  policyChecks    PolicyCheck[]
  reviewEvents    ReviewRequest[]
```
(User 관계는 createdById/lastEditedById에 FK 걸지 않는다 — 단순 id 참조로 충분, 관계 폭발 방지)

- [ ] **Step 2: 신규 모델**

```prisma
enum PolicyCheckType {
  BANNED_TERM
  SIMILARITY
  MINOR_SIGNAL
}

enum PolicyCheckStatus {
  PASS
  WARN
  FLAGGED
}

model PolicyCheck {
  id         String            @id @default(cuid())
  creativeId String
  creative   GeneratedCreative @relation(fields: [creativeId], references: [id], onDelete: Cascade)
  checkType  PolicyCheckType
  status     PolicyCheckStatus
  detail     Json // 매칭된 단어, 유사도 값 등
  createdAt  DateTime          @default(now())

  @@index([creativeId])
  @@map("policy_checks")
}

enum ReviewEventKind {
  POLICY_CHECKED
  REVIEW_REQUESTED
  LOCALIZATION_REVISED
  LOCALIZATION_APPROVED
  APPROVED
  REVISION_REQUESTED
  REJECTED
  MINOR_FLAG_RELEASED
  EXPORTED
}

// 검토·승인 이벤트 로그 (설계 §6 — 이력은 이벤트 테이블로)
model ReviewRequest {
  id         String            @id @default(cuid())
  creativeId String
  creative   GeneratedCreative @relation(fields: [creativeId], references: [id], onDelete: Cascade)
  kind       ReviewEventKind
  actorId    String
  note       String?
  createdAt  DateTime          @default(now())

  @@index([creativeId])
  @@map("review_requests")
}

model Experiment {
  id         String              @id @default(cuid())
  code       String              @unique // 예: TW01 — 추적코드에 들어감
  name       String
  marketCode String              @default("TW")
  createdAt  DateTime            @default(now())
  variants   ExperimentVariant[]

  @@map("experiments")
}

model ExperimentVariant {
  id           String            @id @default(cuid())
  experimentId String
  experiment   Experiment        @relation(fields: [experimentId], references: [id], onDelete: Cascade)
  creativeId   String
  creative     GeneratedCreative @relation(fields: [creativeId], references: [id])
  variantCode  String // V1, V2, ... 실험 내 자동 순번
  trackingCode String            @unique // BL-{exp.code}-{variantCode}-R{revision} — 내보내기 시점 리비전으로 갱신
  createdAt    DateTime          @default(now())

  @@unique([experimentId, creativeId])
  @@unique([experimentId, variantCode])
  @@map("experiment_variants")
}

model ExportPackage {
  id           String   @id @default(cuid())
  experimentId String
  storagePrefix String // exports/{id}/
  manifest     Json // [{trackingCode, filename, adName, utmContent}]
  createdById  String?
  createdAt    DateTime @default(now())

  @@map("export_packages")
}
```

- [ ] **Step 3: 시드에 검수자 계정 추가** (자기승인 금지 때문에 E2E에 두 계정 필수)

`seed.ts`에 admin과 동일 패턴으로 upsert:
```typescript
  const reviewerEmail = process.env.REVIEWER_EMAIL ?? 'reviewer@babeloop.local';
  const reviewerPassword = process.env.REVIEWER_PASSWORD ?? 'changeme-reviewer';
  await prisma.user.upsert({
    where: { email: reviewerEmail },
    update: {},
    create: {
      email: reviewerEmail,
      passwordHash: await argon2.hash(reviewerPassword),
      displayName: 'Reviewer',
      role: 'REVIEWER',
    },
  });
```

- [ ] **Step 4: 마이그레이션 + 시드**

Run: `pnpm prisma migrate dev --name slice4-review-export && pnpm prisma:seed`
Expected: 성공

- [ ] **Step 5: Commit** (Codex는 건너뜀 — 이하 모든 Commit 스텝 동일)

```bash
git add prisma/
git commit -m "feat: 검토·실험·내보내기 스키마와 검수자 시드 계정"
```

---

### Task 2: 추적코드 모듈 (TDD — 왕복 테스트 먼저)

**Files:**
- Create: `apps/server/src/common/tracking-code.ts`, `tracking-code.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
import { buildTrackingCode, parseTrackingCode } from './tracking-code';

describe('trackingCode', () => {
  it('생성 → 파싱 왕복이 보존된다', () => {
    const code = buildTrackingCode({ experimentCode: 'TW01', variantCode: 'V3', revision: 2 });
    expect(code).toBe('BL-TW01-V3-R2');
    expect(parseTrackingCode(code)).toEqual({ experimentCode: 'TW01', variantCode: 'V3', revision: 2 });
  });

  it('실험 코드는 대문자·숫자 2~8자만 허용', () => {
    expect(() => buildTrackingCode({ experimentCode: 'tw-01', variantCode: 'V1', revision: 1 })).toThrow();
    expect(() => buildTrackingCode({ experimentCode: 'T', variantCode: 'V1', revision: 1 })).toThrow();
  });

  it('파싱 실패는 null (예외 아님) — CSV 조인 경로에서 쓰인다', () => {
    expect(parseTrackingCode('BL-TW01-V1')).toBeNull();
    expect(parseTrackingCode('XX-TW01-V1-R1')).toBeNull();
    expect(parseTrackingCode('BL-TW01-V1-R0')).toBeNull();
    expect(parseTrackingCode('아무거나')).toBeNull();
  });

  it('광고명·UTM 헬퍼', () => {
    expect(adNameFor('BL-TW01-V1-R1', '질문형')).toBe('BL-TW01-V1-R1 | zh-TW | hook=질문형');
    expect(utmContentFor('BL-TW01-V1-R1')).toBe('utm_content=BL-TW01-V1-R1');
  });
});
```
(`adNameFor`, `utmContentFor`도 import에 추가)

- [ ] **Step 2: 실패 확인 → 구현**

```typescript
const EXPERIMENT_CODE_RE = /^[A-Z0-9]{2,8}$/;
const VARIANT_CODE_RE = /^V\d+$/;
const TRACKING_CODE_RE = /^BL-([A-Z0-9]{2,8})-(V\d+)-R([1-9]\d*)$/;

export interface TrackingCodeParts {
  experimentCode: string;
  variantCode: string;
  revision: number;
}

export function buildTrackingCode(p: TrackingCodeParts): string {
  if (!EXPERIMENT_CODE_RE.test(p.experimentCode)) throw new Error(`잘못된 실험 코드: ${p.experimentCode}`);
  if (!VARIANT_CODE_RE.test(p.variantCode)) throw new Error(`잘못된 변형 코드: ${p.variantCode}`);
  if (!Number.isInteger(p.revision) || p.revision < 1) throw new Error(`잘못된 리비전: ${p.revision}`);
  return `BL-${p.experimentCode}-${p.variantCode}-R${p.revision}`;
}

export function parseTrackingCode(raw: string): TrackingCodeParts | null {
  const m = TRACKING_CODE_RE.exec(raw.trim());
  if (!m) return null;
  return { experimentCode: m[1], variantCode: m[2], revision: Number(m[3]) };
}

export function adNameFor(trackingCode: string, hookType?: string | null): string {
  return `${trackingCode} | zh-TW | hook=${hookType ?? 'none'}`;
}

export function utmContentFor(trackingCode: string): string {
  return `utm_content=${trackingCode}`;
}
```

- [ ] **Step 3: 통과 확인 → Commit**

```bash
git add apps/server
git commit -m "feat: 추적코드 생성·파싱 (BL-{실험}-{변형}-R{리비전})"
```

---

### Task 3: 상태 머신 (TDD — 전이 매트릭스 전체를 테스트 먼저)

**Files:**
- Create: `apps/server/src/modules/review/creative-state-machine.ts`, `creative-state-machine.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성 — 순수 단위 (DB 없음)**

```typescript
import { CreativeStatus, UserRole } from '../../../generated/prisma';
import { assertTransition, ALLOWED_TRANSITIONS, TransitionContext } from './creative-state-machine';

const base: TransitionContext = {
  creative: {
    status: 'DRAFT' as CreativeStatus,
    createdById: 'author-1',
    lastEditedById: null,
    minorFlagged: false,
    locale: 'zh-TW',
  },
  actor: { id: 'reviewer-1', role: 'REVIEWER' as UserRole },
};

function ctx(over: {
  status?: CreativeStatus; actorId?: string; role?: UserRole;
  minorFlagged?: boolean; lastEditedById?: string | null; locale?: string;
}): TransitionContext {
  return {
    creative: {
      ...base.creative,
      status: over.status ?? base.creative.status,
      minorFlagged: over.minorFlagged ?? false,
      lastEditedById: over.lastEditedById ?? null,
      locale: over.locale ?? 'zh-TW',
    },
    actor: { id: over.actorId ?? 'reviewer-1', role: over.role ?? ('REVIEWER' as UserRole) },
  };
}

describe('CreativeStateMachine', () => {
  it('허용되지 않은 전이는 모두 거부한다 (매트릭스 전수)', () => {
    const all = Object.keys(ALLOWED_TRANSITIONS) as CreativeStatus[];
    for (const from of all) {
      for (const to of all) {
        const allowed = ALLOWED_TRANSITIONS[from].includes(to);
        // locale ko-KR: 매트릭스 자체만 검증 (zh-TW 현지화 게이트는 별도 테스트에서)
        const run = () => assertTransition(ctx({ status: from, locale: 'ko-KR' }), to);
        if (allowed) expect(run).not.toThrow();
        else expect(run).toThrow(/전이할 수 없습니다/);
      }
    }
  });

  it('미성년자 플래그가 해제되지 않으면 IN_REVIEW로 못 간다', () => {
    expect(() => assertTransition(ctx({ status: 'POLICY_CHECKED', minorFlagged: true }), 'IN_REVIEW'))
      .toThrow(/미성년자/);
  });

  it('자기승인 금지 — 생성자·최종수정자는 승인 전이를 실행할 수 없다', () => {
    expect(() => assertTransition(ctx({ status: 'IN_REVIEW', actorId: 'author-1' }), 'LOCALIZATION_APPROVED'))
      .toThrow(/자기승인/);
    expect(() =>
      assertTransition(ctx({ status: 'LOCALIZATION_APPROVED', actorId: 'editor-2', lastEditedById: 'editor-2' }), 'APPROVED'),
    ).toThrow(/자기승인/);
  });

  it('승인 전이는 REVIEWER/ADMIN만 실행할 수 있다', () => {
    expect(() => assertTransition(ctx({ status: 'IN_REVIEW', role: 'EDITOR' as UserRole }), 'LOCALIZATION_APPROVED'))
      .toThrow(/권한/);
  });

  it('zh-TW가 아닌 소재는 IN_REVIEW에서 바로 APPROVED로 갈 수 있다', () => {
    expect(() => assertTransition(ctx({ status: 'IN_REVIEW', locale: 'ko-KR' }), 'APPROVED')).not.toThrow();
    expect(() => assertTransition(ctx({ status: 'IN_REVIEW', locale: 'zh-TW' }), 'APPROVED'))
      .toThrow(/현지화 검수/);
  });
});
```

- [ ] **Step 2: 실패 확인 → 구현**

```typescript
import { CreativeStatus, UserRole } from '../../../generated/prisma';
import { GraphQLError } from 'graphql';

export interface TransitionContext {
  creative: {
    status: CreativeStatus;
    createdById: string | null;
    lastEditedById: string | null;
    minorFlagged: boolean;
    locale: string; // 브리프의 locale
  };
  actor: { id: string; role: UserRole };
}

export const ALLOWED_TRANSITIONS: Record<CreativeStatus, CreativeStatus[]> = {
  DRAFT: ['POLICY_CHECKED'],
  POLICY_CHECKED: ['IN_REVIEW'],
  IN_REVIEW: ['LOCALIZATION_APPROVED', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED'],
  LOCALIZATION_APPROVED: ['APPROVED', 'REVISION_REQUESTED', 'REJECTED'],
  APPROVED: ['EXPORTED'],
  EXPORTED: [],
  REVISION_REQUESTED: ['DRAFT'],
  REJECTED: [],
};

const APPROVAL_TARGETS: CreativeStatus[] = ['LOCALIZATION_APPROVED', 'APPROVED'];

function fail(message: string, code: string): never {
  throw new GraphQLError(message, { extensions: { code } });
}

/** 모든 상태 전이는 이 함수를 통과한다. UI가 아니라 서버가 막는다. */
export function assertTransition(context: TransitionContext, to: CreativeStatus): void {
  const { creative, actor } = context;

  if (!ALLOWED_TRANSITIONS[creative.status].includes(to)) {
    fail(`${creative.status}에서 ${to}로 전이할 수 없습니다`, 'ILLEGAL_TRANSITION');
  }

  if (to === 'IN_REVIEW' && creative.minorFlagged) {
    fail('미성년자 신호 플래그가 해제되지 않았습니다 — 검토 요청 불가 (하드게이트)', 'MINOR_FLAG_ACTIVE');
  }

  if (APPROVAL_TARGETS.includes(to)) {
    if (actor.role !== 'REVIEWER' && actor.role !== 'ADMIN') {
      fail('승인 권한이 없습니다 (REVIEWER/ADMIN 전용)', 'FORBIDDEN');
    }
    if (actor.id === creative.createdById || actor.id === creative.lastEditedById) {
      fail('자기승인은 허용되지 않습니다', 'SELF_APPROVAL_FORBIDDEN');
    }
  }

  // zh-TW 소재는 현지화 검수(LOCALIZATION_APPROVED)를 건너뛸 수 없다 (설계 §8)
  if (to === 'APPROVED' && creative.status === 'IN_REVIEW' && creative.locale === 'zh-TW') {
    fail('zh-TW 소재는 현지화 검수 없이 승인할 수 없습니다', 'LOCALIZATION_GATE');
  }
}
```

주의: 매트릭스 전수 테스트가 `IN_REVIEW → APPROVED`를 "허용"으로 순회하므로 기본 컨텍스트의 locale이 zh-TW면 게이트에 걸린다 — 전수 테스트의 기본 locale은 `ko-KR`로 두거나, 전수 순회 시 `locale: 'ko-KR'`을 명시할 것 (테스트 작성 시 반영).

- [ ] **Step 3: 통과 확인 → Commit**

```bash
git add apps/server
git commit -m "feat: 생성물 상태 머신 — 전이 매트릭스·자기승인 금지·현지화 게이트·미성년자 하드게이트"
```

---

### Task 4: BabeGuard 검사 서비스 + policy-check 큐

**Files:**
- Create: `apps/server/src/modules/policy/banned-terms.ts`, `policy-check.service.ts`, `apps/server/src/queues/policy-check.processor.ts`
- Modify: `queue.constants.ts` (`POLICY_CHECK_QUEUE = 'policy-check'`, `RUN_POLICY_CHECK: 'run-policy-check'`, `runPolicyCheckJobId(creativeId)` — `--` 구분자), `worker.module.ts`

- [ ] **Step 1: 상수 작성**

`banned-terms.ts`:
```typescript
// 금지어·미성년 신호 — MVP는 코드 상수. 편집 UI가 생기면 DB 테이블로 이관.
export const BANNED_TERMS = ['100% 보장', '무조건 당첨', '도박', '수익 보장', '섹스'];

// 미성년자 신호 키워드 — 하나라도 매칭되면 하드게이트 플래그.
// 과탐(false positive)은 감수한다 — 해제는 사람 서명으로만 가능하다 (설계 §9).
export const MINOR_SIGNAL_TERMS = ['미성년', '고등학생', '중학생', '초등학생', '교복', '로리', '쇼타', '10대'];
```

- [ ] **Step 2: PolicyCheckService 구현**

`policy-check.service.ts` — 프로세서가 호출하는 순수 검사 로직:
```typescript
@Injectable()
export class PolicyCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vectors: VectorSearchRepository,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
  ) {}

  /** 검사 3종을 실행하고 policy_checks에 기록. minorFlagged를 갱신하고 결과 요약을 반환한다. */
  async runAll(creativeId: string): Promise<{ minorFlagged: boolean }> {
    const creative = await this.prisma.generatedCreative.findUniqueOrThrow({
      where: { id: creativeId },
      include: { localizations: { orderBy: { createdAt: 'desc' } } },
    });
    const texts = [creative.koreanText, ...creative.localizations.map((l) => l.text)].join('\n');

    // 1. 금지어
    const bannedHits = BANNED_TERMS.filter((t) => texts.includes(t));
    await this.record(creativeId, 'BANNED_TERM', bannedHits.length ? 'WARN' : 'PASS', { hits: bannedHits });

    // 2. 경쟁 원본과의 유사도 (설계 §15 — 임계 초과 시 자동 승인 금지 → WARN 기록)
    const vector = await this.embedder.embed(creative.koreanText);
    const similar = await this.vectors.searchSimilar({ vector, model: this.embedder.model, limit: 1 });
    const topSimilarity = similar[0]?.similarity ?? 0;
    const SIMILARITY_THRESHOLD = 0.9;
    await this.record(creativeId, 'SIMILARITY', topSimilarity > SIMILARITY_THRESHOLD ? 'WARN' : 'PASS', {
      topSimilarity, threshold: SIMILARITY_THRESHOLD, nearestSourceAdId: similar[0]?.sourceAdId ?? null,
    });

    // 3. 미성년자 신호 — 하드게이트. 이 검사는 어떤 설정으로도 비활성화할 수 없다.
    const minorHits = MINOR_SIGNAL_TERMS.filter((t) => texts.includes(t));
    const minorFlagged = minorHits.length > 0;
    await this.record(creativeId, 'MINOR_SIGNAL', minorFlagged ? 'FLAGGED' : 'PASS', { hits: minorHits });
    if (minorFlagged) {
      await this.prisma.generatedCreative.update({
        where: { id: creativeId },
        data: { minorFlagged: true, minorFlagNote: `자동 플래그: ${minorHits.join(', ')}` },
      });
    }
    return { minorFlagged };
  }

  private record(creativeId: string, checkType: PolicyCheckType, status: PolicyCheckStatus, detail: object) {
    return this.prisma.policyCheck.create({ data: { creativeId, checkType, status, detail } });
  }
}
```

- [ ] **Step 3: 프로세서 구현** — 기존 프로세서 패턴 그대로. `process()`: markRunning → `policyCheck.runAll(creativeId)` → 상태 머신으로 `DRAFT → POLICY_CHECKED` 전이(`prisma.generatedCreative.update`) + `review_requests`에 `POLICY_CHECKED` 이벤트(actorId는 잡 payload의 requestedById) → markSucceeded(결과 요약). 실패 처리 기존 패턴.

전이 시 상태 머신 사용법: 프로세서는 사람 액터가 아니므로 `assertTransition`은 상태 매트릭스 확인용으로만 호출 (`actor: { id: payload.requestedById, role: 'ADMIN' }`처럼 시스템 액터 — POLICY_CHECKED 전이에는 승인 가드가 없어 안전).

- [ ] **Step 4: Commit**

```bash
git add apps/server
git commit -m "feat: BabeGuard 검사 3종 (금지어·유사도·미성년 하드게이트) + policy-check 큐"
```

---

### Task 5: 검토 GraphQL (전이 mutation 전부)

**Files:**
- Create: `apps/server/src/modules/review/review.models.ts`, `review.inputs.ts`, `review.service.ts`, `review.resolver.ts`, `review.module.ts`
- Modify: `app.module.ts`, `generate-schema.ts`, `worker.module.ts`(ReviewModule은 워커 불필요 — policy 모듈만)

- [ ] **Step 1: 구현**

`review.service.ts` — 모든 메서드는 ①creative+brief 로드(locale은 brief.locale) ②`assertTransition` ③업데이트 ④`review_requests` 이벤트 기록 순서. 메서드:

- `runPolicyCheck(user, creativeId)` → DRAFT 상태 확인 후 policy-check 큐 등록 (`runPolicyCheckJobId(creativeId)`, payload에 `requestedById: user.id`), Job 반환
- `requestReview(user, creativeId)` → `assertTransition(ctx, 'IN_REVIEW')` → 상태 갱신 + `REVIEW_REQUESTED` 이벤트
- `reviseLocalization(user, creativeId, text, note?)` → IN_REVIEW 상태에서만. `LocalizationVersion` kind `HUMAN_REVISED` 생성(reviewerId=user.id) + `LOCALIZATION_REVISED` 이벤트. **상태 전이 아님** — 수정은 검수의 일부
- `approveLocalization(user, creativeId, note?)` → 전이 → 최신 zh-TW 텍스트(HUMAN_REVISED 최신, 없으면 AI_DRAFT)를 kind `APPROVED`로 복사(reviewerId 기록 — 설계 §5의 최종 승인본) + 이벤트
- `approveCreative(user, creativeId, note?)` → 전이 `APPROVED` + 이벤트
- `requestRevision(user, creativeId, reason)` → 전이 `REVISION_REQUESTED` + 이벤트 (reason 필수)
- `rejectCreative(user, creativeId, reason)` → 전이 `REJECTED` + 이벤트
- `updateCreativeText(user, creativeId, koreanText)` → DRAFT 또는 REVISION_REQUESTED에서만. REVISION_REQUESTED면 `assertTransition(ctx,'DRAFT')` 후 DRAFT 복귀 + `revision: {increment: 1}`. `lastEditedById: user.id`. 수정 후 기존 zh-TW 버전은 유지(이력)하되 재현지화는 정책검사→검토 흐름에서 다시 — localize 잡 재등록(`localizeZhTwJobId`)
- `releaseMinorFlag(user, creativeId, reason)` → REVIEWER/ADMIN만, reason 필수. `minorFlagged: false`, `minorFlagNote: reason` + `MINOR_FLAG_RELEASED` 이벤트. **어떤 env/설정도 이 함수를 대체할 수 없다**
- `creatives(status?)` → 크리에이티브 목록 (brief 제목·locale·현지화·정책검사·실험변형 include, 최신순). 별도의 reviewQueue 쿼리는 만들지 않는다 — status 필터로 충분 (YAGNI)

`review.resolver.ts`: 위 전부 노출. 승인·해제류는 `@Roles('ADMIN','REVIEWER')`, 나머지는 `@Roles('ADMIN','EDITOR','REVIEWER')`. **generate-schema.ts에 ReviewResolver 추가.**

`review.models.ts`: `CreativeDetailModel`(GeneratedCreative 전 필드 + briefTitle, locale, localizations, policyChecks, reviewEvents, experimentVariants{trackingCode}) — 기존 `GeneratedCreativeModel` 재사용 가능하면 확장. `PolicyCheckModel`, `ReviewEventModel`. enum 등록 3종.

- [ ] **Step 2: 컴파일 확인 → Commit**

```bash
git add apps/server
git commit -m "feat: 검토 워크플로 GraphQL — 전이 전부 상태 머신 경유, 이벤트 로그 기록"
```

---

### Task 6: 실험·내보내기 GraphQL

**Files:**
- Create: `apps/server/src/modules/experiment/` 5개 파일 + `export.service.ts`
- Modify: `app.module.ts`, `generate-schema.ts`

- [ ] **Step 1: 구현**

`experiment.service.ts`:
- `create(input {code, name})` — code는 `EXPERIMENT_CODE_RE` 검증(tracking-code 모듈의 검증 재사용: buildTrackingCode를 더미 값으로 호출하지 말고 정규식 export), 중복 code는 DUPLICATE 오류
- `addCreative(experimentId, creativeId)` — creative는 APPROVED 상태여야 함(아니면 `NOT_APPROVED` 오류). variantCode = `V${기존 variants 수 + 1}`, trackingCode = `buildTrackingCode({experimentCode, variantCode, revision: creative.revision})`. `@@unique([experimentId, creativeId])` 충돌 시 DUPLICATE 오류
- `findAll()` — variants + creative(koreanText, status) include

`export.service.ts`:
```typescript
async exportExperiment(user: User, experimentId: string): Promise<ExportResult> {
  // 1. 실험 + variants + creative(+brief, localizations) 로드. APPROVED 상태 variant만 대상.
  //    대상 0개면 GraphQLError('내보낼 승인된 소재가 없습니다', NO_APPROVED_CREATIVES)
  // 2. 각 variant:
  //    - trackingCode를 현재 revision 기준으로 재계산해 variant 행 갱신 (재승인-재내보내기 대응)
  //    - zh-TW 최종본 = kind APPROVED 최신 (없으면 오류 — 상태 머신상 있어야 함)
  //    - 파일 내용 생성 (아래 형식), storage.putBuffer(`exports/${packageId}/${trackingCode}.txt`)
  //    - assertTransition → EXPORTED 갱신 + EXPORTED 이벤트
  // 3. manifest.csv 생성·저장: trackingCode,adName,utmContent,filename 헤더 + 행
  //    ⚠️ 소재 1개 = 광고 1개 규칙 안내 문구를 manifest 첫 줄 주석으로 포함 (설계 §7)
  // 4. export_packages 행 생성 (manifest Json 포함)
  // 5. 반환: { package, files: [{trackingCode, filename, url: presignGet(...)}] }
}
```

variant 파일 형식 (`{trackingCode}.txt`):
```
추적코드: {trackingCode}
광고명(권장): {adNameFor(trackingCode, creative.hookType)}
UTM: {utmContentFor(trackingCode)}
규칙: 광고 1개에 소재 1개만 연결할 것 (Dynamic Creative 금지 — 소재 단위 성과 분석 불가)

--- zh-TW 승인본 ---
{approved localization text}

--- 한국어 원문 (참고용) ---
{creative.koreanText}
```

`experiment.resolver.ts`: `createExperiment`, `addCreativeToExperiment`, `exportExperiment`(Roles ADMIN/EDITOR/REVIEWER), Query `experiments`, `exportPackages(experimentId)`. **generate-schema.ts에 ExperimentResolver 추가.**

- [ ] **Step 2: 컴파일 확인 → Commit**

```bash
git add apps/server
git commit -m "feat: 실험·변형 배정·추적코드 각인 파일 내보내기"
```

---

### Task 7: 통합 테스트 — 검토 흐름 전체

**Files:**
- Create: `apps/server/test/review-flow.e2e-spec.ts`

- [ ] **Step 1: 테스트 작성** (Testcontainers — 샌드박스 실행 불가 시 작성만)

준비 헬퍼: prisma로 brief + creative(DRAFT, koreanText 지정, createdById=editor) 직접 삽입 (생성 파이프라인 재실행은 slice3 테스트 몫 — 여기선 검토 흐름에 집중). zh-TW AI_DRAFT localization도 삽입. worker 컨텍스트 기동 (policy-check 큐 소비).

시나리오 (에이전트 2개: editor, reviewer):
1. **행복 경로**: editor가 runPolicyCheck → 잡 완료 대기 → POLICY_CHECKED (policy_checks 3행: BANNED_TERM PASS, SIMILARITY PASS, MINOR_SIGNAL PASS) → requestReview → IN_REVIEW → reviewer가 reviseLocalization('好的翻譯', note) → approveLocalization → LOCALIZATION_APPROVED (kind APPROVED 버전 생성, reviewerId=reviewer) → approveCreative → APPROVED → review_requests에 이벤트 5종 기록 확인
2. **자기승인 차단**: editor(생성자)가 approveLocalization 시도 → `SELF_APPROVAL_FORBIDDEN`. reviewer가 updateCreativeText로 수정한 소재는 reviewer가 승인 시도 → 같은 오류
3. **현지화 게이트**: IN_REVIEW에서 approveCreative 바로 시도 → `LOCALIZATION_GATE`
4. **미성년자 하드게이트**: koreanText에 '교복' 포함 소재 → 정책검사 → minorFlagged=true, MINOR_SIGNAL FLAGGED → requestReview → `MINOR_FLAG_ACTIVE` 차단 → editor가 releaseMinorFlag 시도 → FORBIDDEN(역할) → reviewer가 reason과 함께 해제 → requestReview 성공, MINOR_FLAG_RELEASED 이벤트 존재
5. **불법 전이**: DRAFT에서 approveCreative → `ILLEGAL_TRANSITION`
6. **수정 요청 루프**: IN_REVIEW → requestRevision(reason) → REVISION_REQUESTED → editor updateCreativeText → DRAFT + revision=2 + lastEditedById=editor
7. **내보내기**: 승인된 소재 2개 → createExperiment(code 'TW01') → addCreativeToExperiment ×2 (V1, V2) → exportExperiment → files에 trackingCode `BL-TW01-V1-R1`·`BL-TW01-V2-R1`, presigned URL fetch → 본문에 추적코드·zh-TW 승인본 포함, manifest.csv 존재, 소재 상태 EXPORTED
8. **EXPORTED 불변**: updateCreativeText 시도 → 오류. APPROVED 아닌 소재 addCreativeToExperiment → NOT_APPROVED

- [ ] **Step 2: 실행 (로컬 검증 시)**

Run: `pnpm --filter @babeloop/server test -- review-flow`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/test
git commit -m "test: 검토 흐름 통합 — 게이트 3종·이벤트 로그·내보내기 검증"
```

---

### Task 8: 웹 — 검토·실험 페이지

**Files:**
- Create: `apps/web/src/pages/ReviewPage.tsx`, `ExperimentsPage.tsx`
- Modify: `apps/web/src/App.tsx` (라우트 `/review`, `/experiments` + 내비 "검토", "실험")

- [ ] **Step 1: ReviewPage** — `creatives` 쿼리(상시 pollInterval 3000). 카드(`<li>`)마다: koreanText(잘라서), 상태 배지(enum 값 그대로 텍스트 — E2E 의존), revision, zh-TW 최신 텍스트, minorFlagged면 ⚠️ 표시 + (REVIEWER/ADMIN에게) 해제 사유 입력+버튼. 상태별 액션 버튼:
  - DRAFT: "정책 검사"
  - POLICY_CHECKED: "검토 요청"
  - IN_REVIEW: zh-TW 수정 textarea(label "zh-TW 수정") + "수정 저장", "현지화 승인", "수정 요청"(사유 인라인 input), "거절"(사유 인라인 input)
  - **`window.prompt`/`alert`/`confirm` 사용 금지** — 브라우저 dialog는 E2E 자동화를 차단한다. 사유 입력은 전부 인라인 input
  - LOCALIZATION_APPROVED: "최종 승인"
  - APPROVED: 실험 선택 드롭다운(experiments 쿼리) + "실험에 추가"
  - EXPORTED: 추적코드 텍스트 표시
  - 오류는 GraphQL 오류 메시지를 `role="alert"`로 표시 (자기승인 차단 메시지가 사용자에게 보여야 함)
  - `me` 쿼리로 현재 역할 확인해 버튼 노출 제어 (서버가 이미 막지만 UX)

- [ ] **Step 2: ExperimentsPage** — 실험 생성 폼(label "실험 코드", "실험 이름", 버튼 "실험 생성"), 실험 카드(`<li>`): variants(variantCode, trackingCode, creative 문구 요약), "내보내기" 버튼 → 결과 파일 목록 `<a href={url}>{filename}</a>` + manifest 링크. 내보내기 결과는 mutation 응답으로 바로 렌더.

- [ ] **Step 3: App.tsx** — 내비: 브랜드 | 미디어 | 광고 | 브리프 | 검토 | 실험. 로그아웃 버튼도 추가 (E2E가 계정 전환에 사용 — `logout` mutation 후 `/login` 이동, 버튼 이름 "로그아웃").

- [ ] **Step 4: 빌드 확인 → Commit**

Run: `pnpm --filter @babeloop/server schema:emit && pnpm --filter @babeloop/web build`

```bash
git add apps/web
git commit -m "feat: 검토·실험 화면과 로그아웃"
```

---

### Task 9: E2E

**Files:**
- Create: `e2e/slice4.spec.ts`

- [ ] **Step 1: 작성**

```typescript
import { expect, test } from '@playwright/test';

test.setTimeout(180_000);

async function login(page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}

test('정책검사 → 검토 → 검수·승인(계정 전환) → 실험 → 추적코드 내보내기', async ({ page }) => {
  const tag = Math.random().toString(36).slice(2, 8); // 짧은 고유 토큰 (Mock 제목 잘림 회피)
  const expCode = `T${tag.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;

  // 1) admin: 광고→브리프→변형 (기존 흐름)
  await login(page, 'admin@babeloop.local', 'changeme-admin');
  await page.getByRole('link', { name: '광고' }).click();
  await page.getByLabel('제목').fill(`ad-${tag}`);
  await page.getByLabel('광고 문구').fill(`주인공 경험 ${tag}`);
  await page.getByRole('button', { name: '광고 등록' }).click();
  await expect(page.locator('li', { hasText: `ad-${tag}` }).getByText('ANALYZED')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: '브리프' }).click();
  await page.getByLabel('포커스').fill(`검토 e2e ${tag}`);
  await page.getByRole('button', { name: '브리프 생성' }).click();
  const briefCard = page.locator('li', { hasText: `검토 e2e ${tag}` }).first();
  await expect(briefCard).toBeVisible({ timeout: 30_000 });
  await briefCard.getByRole('button', { name: '문구 변형 3개 생성' }).click();
  await expect(briefCard.getByText('[MOCK zh-TW]').first()).toBeVisible({ timeout: 60_000 });

  // 2) admin: 정책검사 → 검토 요청 (변형 1번)
  await page.getByRole('link', { name: '검토' }).click();
  const card = page.locator('li', { hasText: '[MOCK 문구 1]' }).first();
  await card.getByRole('button', { name: '정책 검사' }).click();
  await expect(card.getByText('POLICY_CHECKED')).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: '검토 요청' }).click();
  await expect(card.getByText('IN_REVIEW')).toBeVisible({ timeout: 15_000 });

  // 3) 계정 전환 → reviewer가 검수·승인 (자기승인 금지 — admin이 만든 소재는 admin이 승인 불가)
  await page.getByRole('button', { name: '로그아웃' }).click();
  await login(page, 'reviewer@babeloop.local', 'changeme-reviewer');
  await page.getByRole('link', { name: '검토' }).click();
  const rCard = page.locator('li', { hasText: '[MOCK 문구 1]' }).first();
  await rCard.getByLabel('zh-TW 수정').fill(`最終審校完成 ${tag}`);
  await rCard.getByRole('button', { name: '수정 저장' }).click();
  await rCard.getByRole('button', { name: '현지화 승인' }).click();
  await expect(rCard.getByText('LOCALIZATION_APPROVED')).toBeVisible({ timeout: 15_000 });
  await rCard.getByRole('button', { name: '최종 승인' }).click();
  await expect(rCard.getByText('APPROVED', { exact: true })).toBeVisible({ timeout: 15_000 });

  // 4) 실험 생성 → 소재 추가 → 내보내기 → 추적코드 확인
  await page.getByRole('link', { name: '실험' }).click();
  await page.getByLabel('실험 코드').fill(expCode);
  await page.getByLabel('실험 이름').fill(`E2E 실험 ${tag}`);
  await page.getByRole('button', { name: '실험 생성' }).click();
  const expCard = page.locator('li', { hasText: `E2E 실험 ${tag}` });
  await expect(expCard).toBeVisible({ timeout: 10_000 });

  await page.getByRole('link', { name: '검토' }).click();
  const aCard = page.locator('li', { hasText: '[MOCK 문구 1]' }).first();
  await aCard.getByLabel('실험 선택').selectOption({ label: `E2E 실험 ${tag}` });
  await aCard.getByRole('button', { name: '실험에 추가' }).click();
  await expect(aCard.getByText(`BL-${expCode}-V1-R1`)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('link', { name: '실험' }).click();
  const expCard2 = page.locator('li', { hasText: `E2E 실험 ${tag}` });
  await expCard2.getByRole('button', { name: '내보내기' }).click();
  const fileLink = expCard2.getByRole('link', { name: `BL-${expCode}-V1-R1.txt` });
  await expect(fileLink).toBeVisible({ timeout: 15_000 });

  // 파일 내용에 추적코드와 zh-TW 승인본 포함
  const url = await fileLink.getAttribute('href');
  const res = await page.request.get(url!);
  expect(res.ok()).toBeTruthy();
  const body = await res.text();
  expect(body).toContain(`BL-${expCode}-V1-R1`);
  expect(body).toContain(`最終審校完成 ${tag}`);
});
```

주의: `[MOCK 문구 1]` 카드가 이전 실행 데이터와 겹칠 수 있다 — ReviewPage 카드에는 브리프 제목도 표시해 `hasText`로 tag를 함께 매칭하는 편이 안전: `page.locator('li', { hasText: `검토 e2e ${tag}` }).filter({ hasText: '[MOCK 문구 1]' })`. **구현 시 ReviewPage 카드에 브리프 제목 표시 필수** — E2E는 이 조합 셀렉터를 사용할 것 (위 코드의 card/rCard/aCard 전부).

- [ ] **Step 2: 실행 확인**

Run: `pnpm e2e`
Expected: slice0~4 전부 passed

- [ ] **Step 3: Commit**

```bash
git add e2e
git commit -m "test: 슬라이스 4 완료 기준 E2E — 검수·승인·추적코드 내보내기"
```

---

## 슬라이스 4 완료 체크리스트

- [ ] 상태 머신 전이 매트릭스 전수 단위 테스트 PASS
- [ ] 추적코드 왕복 단위 테스트 PASS
- [ ] 통합: 자기승인 차단·현지화 게이트·미성년자 하드게이트(사람 해제만 가능)·EXPORTED 불변
- [ ] 내보낸 파일에 추적코드·광고명·UTM·소재1=광고1 규칙 안내 포함
- [ ] `review_requests`에 전이 이벤트 전부 기록
- [ ] 전체 테스트 + E2E 5종 PASS

## 다음 슬라이스 예고

슬라이스 5 (성과): performance_imports, performance_daily, funnel_events — 성과 CSV 업로드(추적코드 조인), 소재별 퍼널 대시보드(그레인 정직 표시), 성과 상위 패턴의 브리프 환류. **MVP 완료.**

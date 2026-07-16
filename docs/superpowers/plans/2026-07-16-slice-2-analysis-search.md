# BabeLoop 슬라이스 2 (분석·검색) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경쟁사·광고 등록(수동 + Sensor Tower CSV 임포트) → Mock 광고 분석(Zod 검증) → Mock 임베딩 → pgvector 유사 광고 검색. 이 프로젝트의 기술 핵심(분석→임베딩→검색 루프)을 관통 검증한다.

**Architecture:** 분석은 `creative-analysis` 큐, 임베딩은 `embedding` 큐로 분리 (스펙 §18). AI 응답은 자유 문자열이 아니라 Zod 스키마로 검증하고 실패 시 1회 repair 재요청 (스펙 §9.6, 설계 §11). 벡터 SQL은 전부 `VectorSearchRepository`에 격리 (설계 원칙 5). CSV 임포트는 외부 S3 링크 만료 대응으로 즉시 미디어 다운로드 작업을 건다.

**참조:** `docs/superpowers/specs/2026-07-14-babeloop-design.md`, `fixtures/sensortower-creative-gallery-sample.csv` (실물 UTF-16 픽스처)

**설계 문서와의 차이:** `creative_tags` 테이블은 만들지 않는다 — 태그는 `creative_analyses`의 배열 컬럼(targetAudience 등)으로 충분하며, 별도 태그 필터링이 필요해지는 슬라이스에서 추가한다 (YAGNI).

---

## 누적 환경 제약 (슬라이스 0·1 검증에서 실측 — 반드시 지킬 것)

1. pnpm은 corepack으로 활성화됨. 호스트 포트: postgres **5433**, redis **6380**.
2. Apollo Server 5 + `@as-integrations/express5`. `playground` 옵션 금지.
3. Prisma Client 위치: `apps/server/generated/prisma`. `src/x/y/`에서 `'../../../generated/prisma'`.
4. **새 Resolver는 `generate-schema.ts` 목록에 반드시 추가.**
5. **BullMQ 커스텀 jobId에 `:` 금지** (Redis 키 구분자) — 구분자는 `--`.
6. **웹에서 GraphQL enum은 문자열 리터럴 금지** — `import { XxxEnum } from '../generated/graphql'` 후 enum 멤버 사용 (슬라이스 1에서 타입 오류 실측).
7. jest 열린 핸들 금지: BullMQ Queue/Worker·ioredis·Nest 컨텍스트는 teardown에서 close.
8. Prisma 모델 필드는 camelCase 컬럼으로 생성됨 (`@@map`은 테이블명만) — raw SQL에서 `"sourceAdId"` 처럼 따옴표 필수.
9. Codex 샌드박스: git 금지, 실행 불가 명령(pnpm install/docker/migrate/test)은 **기다리지 말고 즉시 건너뛰고** 목록으로 보고. **wait 루프 금지 — 모든 파일 작성이 끝나면 즉시 완료 보고로 종료한다** (슬라이스 1에서 1시간 유휴 대기 발생).

---

## 파일 구조 (추가/변경)

```
prisma/schema.prisma                          # Competitor, SourceAd, CreativeAnalysis, CreativeEmbedding
apps/server/src/
├── common/storage/storage.service.ts         # putBuffer, presignGet 추가
├── providers/
│   ├── text/text-generation.provider.ts      # 인터페이스 + 토큰
│   ├── text/mock-text-generation.provider.ts # 결정적 Mock
│   ├── text/text.module.ts
│   ├── text/generate-json-with-repair.ts     # Zod 검증 + 1회 repair 재시도
│   ├── embedding/embedding.provider.ts, mock-embedding.provider.ts, embedding.module.ts
├── queues/
│   ├── queue.constants.ts                    # 큐·잡 상수 추가
│   ├── creative-analysis.processor.ts
│   ├── embedding.processor.ts
│   └── media-processing.processor.ts         # download-external-media 잡 추가
├── modules/
│   ├── competitor/ (competitor.model.ts, .inputs.ts, .service.ts, .resolver.ts, .module.ts)
│   ├── source-ad/  (source-ad.models.ts, .inputs.ts, .service.ts, .resolver.ts, .module.ts,
│   │                sensortower-csv.parser.ts, csv-import.service.ts)
│   └── creative-analysis/ (creative-analysis.schema.ts, vector-search.repository.ts,
│                           analysis.service.ts, creative-analysis.module.ts)
├── worker.module.ts                          # 새 큐·프로세서 등록
├── app.module.ts                             # 새 모듈 등록
└── generate-schema.ts                        # CompetitorResolver, SourceAdResolver 추가
apps/server/src/providers/text/*.spec.ts, embedding/*.spec.ts
apps/server/src/modules/source-ad/sensortower-csv.parser.spec.ts
apps/server/test/vector-search.e2e-spec.ts, source-ad.e2e-spec.ts, analysis-pipeline.e2e-spec.ts, csv-import.e2e-spec.ts
apps/web/src/pages/SourceAdsPage.tsx
apps/web/src/App.tsx                          # /ads 라우트 + 내비
e2e/slice2.spec.ts
```

---

### Task 1: Prisma 스키마 확장 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 모델 추가**

`MediaAsset`에 `sourceAds SourceAd[]` 관계 필드 추가. 아래 모델들 추가:

```prisma
enum ReferenceCategory {
  DIRECT_COMPETITOR
  LOCAL_MARKET_REFERENCE
  CREATIVE_REFERENCE
  FEATURE_REFERENCE
  ONBOARDING_REFERENCE
  MONETIZATION_REFERENCE
  CREATOR_ECOSYSTEM_REFERENCE
}

model Competitor {
  id        String            @id @default(cuid())
  name      String            @unique
  category  ReferenceCategory
  notes     String?
  createdAt DateTime          @default(now())
  sourceAds SourceAd[]

  @@map("competitors")
}

enum SourceAdOrigin {
  MANUAL_URL
  MANUAL_FILE
  SENSOR_TOWER_CSV
}

enum SourceAdStatus {
  REGISTERED
  ANALYZING
  ANALYZED
  FAILED
}

enum Confidence {
  LOW
  MEDIUM
  HIGH
}

model SourceAd {
  id              String             @id @default(cuid())
  origin          SourceAdOrigin
  status          SourceAdStatus     @default(REGISTERED)
  competitorId    String?
  competitor      Competitor?        @relation(fields: [competitorId], references: [id])
  title           String?
  adText          String?
  sourceUrl       String?
  externalId      String?            @unique // 정규화된 URL 또는 ST Creative URL — 중복 등록 차단
  networks        String[]
  countries       String[]
  firstSeenAt     DateTime?
  lastSeenAt      DateTime?
  impressionShare Float?
  mediaAssetId    String?
  mediaAsset      MediaAsset?        @relation(fields: [mediaAssetId], references: [id])
  // DataProvenance 관례 (설계 §6)
  provider        String // 'manual' | 'sensortower-csv'
  observedAt      DateTime?
  importedAt      DateTime           @default(now())
  isEstimated     Boolean            @default(false)
  confidence      Confidence         @default(MEDIUM)
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  analyses        CreativeAnalysis[]
  embeddings      CreativeEmbedding[]

  @@index([status])
  @@index([competitorId])
  @@map("source_ads")
}

model CreativeAnalysis {
  id                String   @id @default(cuid())
  sourceAdId        String
  sourceAd          SourceAd @relation(fields: [sourceAdId], references: [id], onDelete: Cascade)
  summary           String
  hookText          String?
  hookType          String
  ctaText           String?
  ctaType           String?
  targetAudience    String[]
  emotionalTriggers String[]
  genres            String[]
  language          String
  raw               Json // Zod 검증을 통과한 전체 분석 JSON
  provider          String
  model             String
  promptVersion     String
  createdAt         DateTime @default(now())

  @@index([sourceAdId])
  @@map("creative_analyses")
}

model CreativeEmbedding {
  id         String                 @id @default(cuid())
  sourceAdId String
  sourceAd   SourceAd               @relation(fields: [sourceAdId], references: [id], onDelete: Cascade)
  model      String
  dimension  Int
  embedding  Unsupported("vector(1536)")
  createdAt  DateTime               @default(now())

  @@unique([sourceAdId, model])
  @@map("creative_embeddings")
}
```

`Unsupported` 타입이므로 이 테이블의 모든 읽기·쓰기는 Prisma Client가 아니라 `VectorSearchRepository`의 raw SQL로만 한다 (설계 원칙 5와 일치). 벡터 인덱스(HNSW)는 수백 건 규모에서 불필요 — 데이터가 늘어나는 슬라이스에서 추가.

- [ ] **Step 2: 마이그레이션**

Run: `pnpm prisma migrate dev --name slice2-analysis-search`
Expected: 적용 성공

- [ ] **Step 3: Commit** (Codex는 모든 Commit 스텝을 건너뜀)

```bash
git add prisma/
git commit -m "feat: Competitor·SourceAd·CreativeAnalysis·CreativeEmbedding 스키마"
```

---

### Task 2: TextGenerationProvider + Mock + Zod 검증·repair

**Files:**
- Create: `apps/server/src/providers/text/text-generation.provider.ts`, `mock-text-generation.provider.ts`, `text.module.ts`, `generate-json-with-repair.ts`
- Create: `apps/server/src/modules/creative-analysis/creative-analysis.schema.ts`
- Create: `apps/server/src/providers/text/generate-json-with-repair.spec.ts`
- Modify: `apps/server/src/common/env.validation.ts` (`TEXT_AI_PROVIDER: z.enum(['mock']).default('mock')` 추가), `.env.example`·`.env`에 `TEXT_AI_PROVIDER=mock`

- [ ] **Step 1: 실패하는 테스트 작성**

`generate-json-with-repair.spec.ts`:
```typescript
import { z } from 'zod';
import { generateJsonWithRepair } from './generate-json-with-repair';
import { TextGenerationProvider } from './text-generation.provider';

const schema = z.object({ ok: z.boolean() });

function fakeProvider(outputs: string[]): TextGenerationProvider {
  let i = 0;
  return {
    name: 'fake',
    model: 'fake-1',
    generate: async () => outputs[Math.min(i++, outputs.length - 1)],
  };
}

describe('generateJsonWithRepair', () => {
  it('유효한 JSON은 한 번에 통과한다', async () => {
    const result = await generateJsonWithRepair(fakeProvider(['{"ok":true}']), { system: 's', prompt: 'p' }, schema);
    expect(result).toEqual({ ok: true });
  });

  it('첫 응답이 깨지면 오류를 포함해 1회 재요청한다', async () => {
    const provider = fakeProvider(['not-json', '{"ok":false}']);
    const result = await generateJsonWithRepair(provider, { system: 's', prompt: 'p' }, schema);
    expect(result).toEqual({ ok: false });
  });

  it('재요청도 실패하면 던진다', async () => {
    await expect(
      generateJsonWithRepair(fakeProvider(['bad', 'still-bad']), { system: 's', prompt: 'p' }, schema),
    ).rejects.toThrow('AI JSON 응답 검증 실패');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @babeloop/server test -- generate-json-with-repair`
Expected: FAIL

- [ ] **Step 3: 구현**

`text-generation.provider.ts`:
```typescript
export interface TextGenerationInput {
  system: string;
  prompt: string;
}

export interface TextGenerationProvider {
  readonly name: string;
  readonly model: string;
  /** 모델의 원시 텍스트 출력을 반환한다. JSON 파싱·검증은 호출자 책임. */
  generate(input: TextGenerationInput): Promise<string>;
}

export const TEXT_GENERATION_PROVIDER = Symbol('TEXT_GENERATION_PROVIDER');
```

`generate-json-with-repair.ts`:
```typescript
import { z } from 'zod';
import { TextGenerationInput, TextGenerationProvider } from './text-generation.provider';

/** AI JSON 응답을 Zod로 검증하고, 실패 시 오류를 포함해 1회 repair 재요청한다 (설계 §11). */
export async function generateJsonWithRepair<T extends z.ZodTypeAny>(
  provider: TextGenerationProvider,
  input: TextGenerationInput,
  schema: T,
): Promise<z.infer<T>> {
  const attempt = (raw: string): z.infer<T> | { error: string } => {
    try {
      const parsed = JSON.parse(raw);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      return { error: result.error.toString() };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };

  const first = attempt(await provider.generate(input));
  if (!(typeof first === 'object' && first !== null && 'error' in first)) return first;

  const repairPrompt = `${input.prompt}\n\n이전 응답이 유효한 JSON 스키마 검증에 실패했다: ${first.error}\n스키마에 맞는 JSON만 출력하라.`;
  const second = attempt(await provider.generate({ system: input.system, prompt: repairPrompt }));
  if (!(typeof second === 'object' && second !== null && 'error' in second)) return second;

  throw new Error(`AI JSON 응답 검증 실패 (repair 재시도 후): ${second.error}`);
}
```

주의: 스키마가 `{error: string}` 형태 자체를 유효값으로 갖는 경우는 이 프로젝트에 없다(분석 스키마는 필수 필드가 다름).

`creative-analysis.schema.ts`:
```typescript
import { z } from 'zod';

export const PROMPT_VERSION = 'analyze-creative@v1';

export const creativeAnalysisSchema = z.object({
  summary: z.string().min(1),
  hook: z.object({ text: z.string().optional(), type: z.string().min(1) }),
  callToAction: z.object({ text: z.string().optional(), type: z.string().optional() }),
  targetAudience: z.array(z.string()),
  emotionalTriggers: z.array(z.string()),
  genres: z.array(z.string()),
  language: z.string().min(1),
});

export type CreativeAnalysisResult = z.infer<typeof creativeAnalysisSchema>;
```

`mock-text-generation.provider.ts` — 결정적: 입력 해시로 목록에서 선택:
```typescript
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
```

`text.module.ts` — OcrModule과 동일 패턴 (Global, `TEXT_AI_PROVIDER` env가 `mock`이면 `MockTextGenerationProvider`, 아니면 throw, `TEXT_GENERATION_PROVIDER` 토큰 export).

`app.module.ts`와 `worker.module.ts` imports에 `TextModule` 추가.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @babeloop/server test -- generate-json-with-repair`
Expected: PASS 3건

- [ ] **Step 5: Commit**

```bash
git add apps/server .env.example
git commit -m "feat: TextGenerationProvider Mock과 Zod 검증·repair 재시도"
```

---

### Task 3: EmbeddingProvider + Mock

**Files:**
- Create: `apps/server/src/providers/embedding/embedding.provider.ts`, `mock-embedding.provider.ts`, `embedding.module.ts`, `mock-embedding.provider.spec.ts`
- Modify: `env.validation.ts` (`EMBEDDING_PROVIDER: z.enum(['mock']).default('mock')`), `.env.example`·`.env`

- [ ] **Step 1: 실패하는 테스트 작성**

`mock-embedding.provider.spec.ts`:
```typescript
import { MockEmbeddingProvider } from './mock-embedding.provider';

describe('MockEmbeddingProvider', () => {
  const provider = new MockEmbeddingProvider();

  it('차원은 1536이고 같은 텍스트는 같은 벡터 (결정적)', async () => {
    const a = await provider.embed('내가 주인공이 되는 이야기');
    const b = await provider.embed('내가 주인공이 되는 이야기');
    expect(a).toHaveLength(1536);
    expect(a).toEqual(b);
  });

  it('다른 텍스트는 다른 벡터', async () => {
    const a = await provider.embed('텍스트 A');
    const b = await provider.embed('텍스트 B');
    expect(a).not.toEqual(b);
  });

  it('단위 벡터로 정규화된다', async () => {
    const v = await provider.embed('정규화 확인');
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @babeloop/server test -- mock-embedding`
Expected: FAIL

- [ ] **Step 3: 구현**

`embedding.provider.ts`:
```typescript
export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
}

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
```

`mock-embedding.provider.ts`:
```typescript
import { createHash } from 'crypto';
import { EmbeddingProvider } from './embedding.provider';

/** sha256 시드 xorshift32 — 같은 텍스트면 항상 같은 단위 벡터. */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly model = 'mock-embedding-1';
  readonly dimension = 1536;

  async embed(text: string): Promise<number[]> {
    const seedBytes = createHash('sha256').update(text).digest();
    let state = seedBytes.readUInt32LE(0) || 1;
    const next = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0xffffffff;
    };
    const v = Array.from({ length: this.dimension }, () => next() * 2 - 1);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return v.map((x) => x / norm);
  }
}
```

`embedding.module.ts` — 동일 레지스트리 패턴 (`EMBEDDING_PROVIDER` env, Global). `app.module.ts`·`worker.module.ts`에 추가.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @babeloop/server test -- mock-embedding`
Expected: PASS 3건

- [ ] **Step 5: Commit**

```bash
git add apps/server .env.example
git commit -m "feat: EmbeddingProvider와 결정적 Mock (1536차원 단위 벡터)"
```

---

### Task 4: StorageService에 putBuffer·presignGet 추가

**Files:**
- Modify: `apps/server/src/common/storage/storage.service.ts`, `apps/server/test/storage.e2e-spec.ts`

- [ ] **Step 1: 실패하는 테스트 추가** (storage.e2e-spec.ts에)

```typescript
  it('putBuffer로 저장하고 presignGet URL로 내려받을 수 있다', async () => {
    const { StorageService } = await import('../src/common/storage/storage.service');
    const storage = t.app.get(StorageService);
    await storage.putBuffer('test/direct.txt', Buffer.from('direct-put'), 'text/plain');
    const url = await storage.presignGet('test/direct.txt');
    const res = await fetch(url);
    expect(await res.text()).toBe('direct-put');
  });
```

- [ ] **Step 2: 실패 확인 → 구현**

`storage.service.ts`에 추가:
```typescript
  async putBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  presignGet(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 900,
    });
  }
```

- [ ] **Step 3: 통과 확인**

Run: `pnpm --filter @babeloop/server test -- storage`
Expected: PASS 3건

- [ ] **Step 4: Commit**

```bash
git add apps/server
git commit -m "feat: StorageService putBuffer·presignGet"
```

---

### Task 5: VectorSearchRepository

**Files:**
- Create: `apps/server/src/modules/creative-analysis/vector-search.repository.ts`, `creative-analysis.module.ts`
- Create: `apps/server/test/vector-search.e2e-spec.ts`
- Modify: `app.module.ts`, `worker.module.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`vector-search.e2e-spec.ts`:
```typescript
import { createTestApp, stopContainers, TestApp } from './create-test-app';

describe('VectorSearchRepository', () => {
  let t: TestApp;
  let repo: import('../src/modules/creative-analysis/vector-search.repository').VectorSearchRepository;
  const adIds: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    const { VectorSearchRepository } = await import('../src/modules/creative-analysis/vector-search.repository');
    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    repo = t.app.get(VectorSearchRepository);
    const prisma = t.app.get(PrismaService);
    for (let i = 0; i < 3; i++) {
      const ad = await prisma.sourceAd.create({
        data: { origin: 'MANUAL_URL', provider: 'manual', adText: `ad-${i}` },
      });
      adIds.push(ad.id);
    }
  });

  afterAll(async () => {
    await t.teardown();
    await stopContainers();
  });

  const unit = (i: number) => {
    const v = new Array(1536).fill(0);
    v[i] = 1;
    return v;
  };

  it('업서트 후 같은 벡터 검색 시 similarity 1에 수렴한다', async () => {
    await repo.upsertEmbedding({ sourceAdId: adIds[0], model: 'mock-embedding-1', dimension: 1536, vector: unit(0) });
    await repo.upsertEmbedding({ sourceAdId: adIds[1], model: 'mock-embedding-1', dimension: 1536, vector: unit(0) });
    await repo.upsertEmbedding({ sourceAdId: adIds[2], model: 'mock-embedding-1', dimension: 1536, vector: unit(5) });

    const results = await repo.searchSimilar({
      vector: unit(0), model: 'mock-embedding-1', limit: 10, excludeSourceAdId: adIds[0],
    });
    expect(results[0].sourceAdId).toBe(adIds[1]);
    expect(results[0].similarity).toBeCloseTo(1, 5);
    expect(results.map((r) => r.sourceAdId)).not.toContain(adIds[0]);
  });

  it('모델이 다르면 검색되지 않는다 (혼합 검색 금지)', async () => {
    const results = await repo.searchSimilar({ vector: unit(0), model: 'other-model', limit: 10 });
    expect(results).toHaveLength(0);
  });

  it('차원 불일치는 저장 시점에 거부된다', async () => {
    await expect(
      repo.upsertEmbedding({ sourceAdId: adIds[0], model: 'mock-embedding-1', dimension: 1536, vector: [1, 2, 3] }),
    ).rejects.toThrow('임베딩 차원 불일치');
  });

  it('저장된 벡터를 다시 읽을 수 있다', async () => {
    const v = await repo.getEmbeddingVector(adIds[2], 'mock-embedding-1');
    expect(v).toHaveLength(1536);
    expect(v![5]).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @babeloop/server test -- vector-search`
Expected: FAIL

- [ ] **Step 3: 구현**

`vector-search.repository.ts` — **pgvector SQL은 이 파일 밖에 존재해서는 안 된다**:
```typescript
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface UpsertEmbeddingInput {
  sourceAdId: string;
  model: string;
  dimension: number;
  vector: number[];
}

export interface SimilarResult {
  sourceAdId: string;
  similarity: number;
}

@Injectable()
export class VectorSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toVectorLiteral(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }

  async upsertEmbedding(input: UpsertEmbeddingInput): Promise<void> {
    if (input.vector.length !== input.dimension) {
      throw new Error(`임베딩 차원 불일치: expected ${input.dimension}, got ${input.vector.length}`);
    }
    const vec = this.toVectorLiteral(input.vector);
    await this.prisma.$executeRaw`
      INSERT INTO creative_embeddings (id, "sourceAdId", model, dimension, embedding, "createdAt")
      VALUES (${randomUUID()}, ${input.sourceAdId}, ${input.model}, ${input.dimension}, ${vec}::vector, now())
      ON CONFLICT ("sourceAdId", model)
      DO UPDATE SET embedding = EXCLUDED.embedding, dimension = EXCLUDED.dimension`;
  }

  async searchSimilar(params: {
    vector: number[];
    model: string;
    limit: number;
    excludeSourceAdId?: string;
  }): Promise<SimilarResult[]> {
    const vec = this.toVectorLiteral(params.vector);
    const exclude = params.excludeSourceAdId ?? '';
    const rows = await this.prisma.$queryRaw<{ sourceAdId: string; similarity: number }[]>`
      SELECT "sourceAdId", 1 - (embedding <=> ${vec}::vector) AS similarity
      FROM creative_embeddings
      WHERE model = ${params.model} AND "sourceAdId" <> ${exclude}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${params.limit}`;
    return rows.map((r) => ({ sourceAdId: r.sourceAdId, similarity: Number(r.similarity) }));
  }

  async getEmbeddingVector(sourceAdId: string, model: string): Promise<number[] | null> {
    const rows = await this.prisma.$queryRaw<{ v: string }[]>`
      SELECT embedding::text AS v FROM creative_embeddings
      WHERE "sourceAdId" = ${sourceAdId} AND model = ${model} LIMIT 1`;
    if (rows.length === 0) return null;
    return JSON.parse(rows[0].v) as number[];
  }
}
```

`creative-analysis.module.ts` (Global, 이 시점에는 `VectorSearchRepository`만 providers/exports로 — `AnalysisService`는 Task 10에서 이 모듈에 추가한다). `app.module.ts`·`worker.module.ts`에 추가.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @babeloop/server test -- vector-search`
Expected: PASS 4건

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat: VectorSearchRepository — pgvector upsert·검색·차원 검증 격리"
```

---

### Task 6: Competitor 모듈

**Files:**
- Create: `apps/server/src/modules/competitor/competitor.model.ts`, `.inputs.ts`, `.service.ts`, `.resolver.ts`, `.module.ts`
- Create: `apps/server/test/competitor.e2e-spec.ts` (brand.e2e-spec.ts 패턴 그대로)
- Modify: `app.module.ts`, `generate-schema.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — brand 테스트와 동일 구조: EDITOR가 `createCompetitor(input: {name: "WHIF", category: DIRECT_COMPETITOR})` 성공 + `competitors` 목록에 표시, VIEWER는 FORBIDDEN, 동일 이름 재등록 시 GraphQL 오류 2건.

```typescript
import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, stopContainers, TestApp } from './create-test-app';

const CREATE = `mutation C($input: CreateCompetitorInput!) {
  createCompetitor(input: $input) { id name category }
}`;
const LIST = `query { competitors { id name category } }`;

async function loginAs(t: TestApp, email: string, role: 'EDITOR' | 'VIEWER') {
  const { PrismaService } = await import('../src/common/prisma/prisma.service');
  const prisma = t.app.get(PrismaService);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: await argon2.hash('pw-123456'), displayName: role, role },
  });
  const agent = request.agent(t.app.getHttpServer());
  await agent.post('/graphql').send({ query: `mutation { login(email: "${email}", password: "pw-123456") { id } }` });
  return agent;
}

describe('competitor', () => {
  let t: TestApp;

  beforeAll(async () => { t = await createTestApp(); });
  afterAll(async () => { await t.teardown(); await stopContainers(); });

  it('EDITOR는 경쟁사를 등록하고 목록에서 볼 수 있다', async () => {
    const agent = await loginAs(t, 'comp-editor@test.local', 'EDITOR');
    const res = await agent.post('/graphql').send({
      query: CREATE, variables: { input: { name: 'WHIF', category: 'DIRECT_COMPETITOR' } },
    });
    expect(res.body.errors).toBeUndefined();
    const list = await agent.post('/graphql').send({ query: LIST });
    expect(list.body.data.competitors.some((c: { name: string }) => c.name === 'WHIF')).toBe(true);
  });

  it('같은 이름 재등록은 오류', async () => {
    const agent = await loginAs(t, 'comp-editor@test.local', 'EDITOR');
    const res = await agent.post('/graphql').send({
      query: CREATE, variables: { input: { name: 'WHIF', category: 'DIRECT_COMPETITOR' } },
    });
    expect(res.body.errors).toBeDefined();
  });

  it('VIEWER는 등록할 수 없다', async () => {
    const agent = await loginAs(t, 'comp-viewer@test.local', 'VIEWER');
    const res = await agent.post('/graphql').send({
      query: CREATE, variables: { input: { name: 'Talkie', category: 'CREATIVE_REFERENCE' } },
    });
    expect(res.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });
});
```

- [ ] **Step 2: 실패 확인 → 구현** — brand 모듈과 동일 패턴. 모델 필드: id/name/category/notes/createdAt. `registerEnumType(ReferenceCategory, { name: 'ReferenceCategory' })`. 중복 이름은 서비스에서 사전 조회 후 `GraphQLError('이미 등록된 경쟁사입니다', {extensions:{code:'DUPLICATE'}})`. Mutation은 `@Roles('ADMIN','EDITOR','REVIEWER')`. **generate-schema.ts에 CompetitorResolver 추가.**

- [ ] **Step 3: 통과 확인**

Run: `pnpm --filter @babeloop/server test -- competitor`
Expected: PASS 3건

- [ ] **Step 4: Commit**

```bash
git add apps/server
git commit -m "feat: 경쟁사 등록·목록 GraphQL"
```

---

### Task 7: 큐 상수 확장 + SourceAd 등록 GraphQL

**Files:**
- Modify: `apps/server/src/queues/queue.constants.ts`
- Create: `apps/server/src/modules/source-ad/source-ad.models.ts`, `.inputs.ts`, `.service.ts`, `.resolver.ts`, `.module.ts`
- Create: `apps/server/test/source-ad.e2e-spec.ts`
- Modify: `app.module.ts`, `generate-schema.ts`

- [ ] **Step 1: 큐 상수 확장**

`queue.constants.ts`에 추가:
```typescript
export const CREATIVE_ANALYSIS_QUEUE = 'creative-analysis';
export const EMBEDDING_QUEUE = 'embedding';

// JOB_TYPES에 추가:
//   ANALYZE_CREATIVE: 'analyze-creative',
//   GENERATE_EMBEDDING: 'generate-embedding',
//   DOWNLOAD_EXTERNAL_MEDIA: 'download-external-media',

export function analyzeCreativeJobId(sourceAdId: string): string {
  return `${JOB_TYPES.ANALYZE_CREATIVE}--${sourceAdId}`;
}
export function generateEmbeddingJobId(sourceAdId: string): string {
  return `${JOB_TYPES.GENERATE_EMBEDDING}--${sourceAdId}`;
}
export function downloadExternalMediaJobId(sourceAdId: string): string {
  return `${JOB_TYPES.DOWNLOAD_EXTERNAL_MEDIA}--${sourceAdId}`;
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`source-ad.e2e-spec.ts` (loginAs 헬퍼는 competitor 테스트와 동일):
```typescript
const CREATE_AD = `mutation C($input: CreateSourceAdInput!) {
  createSourceAd(input: $input) { sourceAd { id status adText externalId } job { id } }
}`;
const ADS = `query { sourceAds { id status adText title } }`;
```

테스트 3건:
1. EDITOR가 `{adText: "이번엔 네가 주인공이야", title: "훅 테스트", sourceUrl: "https://example.com/Ad?utm=x&b=2"}` 등록 → `sourceAd.status === 'REGISTERED'`, `job.id === analyze-creative--{id}`, `externalId`가 정규화된 URL(`https://example.com/Ad?b=2&utm=x` — 쿼리 정렬)임을 확인, 목록 조회에 표시
2. **동일 URL(쿼리 순서만 다른 `https://example.com/Ad?b=2&utm=x`) 재등록 → `DUPLICATE_SOURCE_AD` 코드 오류** (스펙 §21 필수 테스트)
3. adText와 sourceUrl이 모두 없으면 BAD_USER_INPUT

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter @babeloop/server test -- source-ad`
Expected: FAIL

- [ ] **Step 4: 구현**

`source-ad.models.ts` — `SourceAdModel`(id, origin, status, title, adText, sourceUrl, externalId, networks, countries, firstSeenAt, lastSeenAt, impressionShare, provider, isEstimated, confidence, createdAt, competitor?, latestAnalysis?), `CreateSourceAdPayload`(sourceAd, job: JobModel?), `CreativeAnalysisModel`(id, summary, hookText, hookType, ctaText, ctaType, targetAudience, emotionalTriggers, genres, language, createdAt). enum 등록: `SourceAdOrigin`, `SourceAdStatus`, `Confidence`.

`latestAnalysis`는 서비스에서 `analyses: { orderBy: { createdAt: 'desc' }, take: 1 }` include 후 `analyses[0] ?? null`로 매핑.

`source-ad.service.ts` 핵심:
```typescript
export function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = '';
  u.searchParams.sort();
  u.hostname = u.hostname.toLowerCase();
  return u.toString();
}
```
- `create(user, input)`: adText·sourceUrl 둘 다 없으면 `BAD_USER_INPUT` GraphQLError. sourceUrl 있으면 `externalId = normalizeUrl(sourceUrl)`, 기존 externalId 존재 시 `GraphQLError('이미 등록된 광고입니다: {기존 id}', {extensions:{code:'DUPLICATE_SOURCE_AD', existingId}})`. `origin: input.sourceUrl ? 'MANUAL_URL' : 'MANUAL_FILE'`, `provider: 'manual'`, `confidence: 'HIGH'`, `isEstimated: false`. adText가 있으면 `creative-analysis` 큐에 `{sourceAdId}` 등록(jobId 규칙, attempts 3, 지수 백오프 — 슬라이스 1의 media 큐 옵션과 동일) + `jobRecord.enqueue`. 반환 `{sourceAd, job}` (job은 adText 없으면 null).
- `findAll()` / `findById(id)` — MEDIA 패턴과 동일.

`source-ad.resolver.ts`: Query `sourceAds`, `sourceAd(id)`; Mutation `createSourceAd`(Roles ADMIN/EDITOR/REVIEWER), `analyzeSourceAd(input:{sourceAdId})` → 분석 잡 재등록 후 JobModel 반환. `SourceAdModule`은 `BullModule.registerQueue({name: CREATIVE_ANALYSIS_QUEUE})` import. **generate-schema.ts에 SourceAdResolver 추가.**

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @babeloop/server test -- source-ad`
Expected: PASS 3건

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat: 광고 원본 등록 GraphQL — URL 정규화 중복 차단, 분석 잡 자동 등록"
```

---

### Task 8: Sensor Tower CSV 파서

**Files:**
- Create: `apps/server/src/modules/source-ad/sensortower-csv.parser.ts`, `sensortower-csv.parser.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — **실물 픽스처 사용**

`sensortower-csv.parser.spec.ts`:
```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSensorTowerCreativeGalleryCsv } from './sensortower-csv.parser';

const FIXTURE = join(__dirname, '../../../../../fixtures/sensortower-creative-gallery-sample.csv');

describe('parseSensorTowerCreativeGalleryCsv', () => {
  it('UTF-16LE(BOM) 실물 픽스처를 파싱한다', () => {
    const { rows, errors } = parseSensorTowerCreativeGalleryCsv(readFileSync(FIXTURE));
    expect(errors).toHaveLength(0);
    expect(rows.length).toBe(10);
    const r = rows[0];
    expect(r.advertiserAppName).toBe('Character AI: Chat, Talk, Text');
    expect(r.creativeUrl).toMatch(/^https:\/\//);
    expect(r.firstSeen).toBeInstanceOf(Date);
    expect(r.lastSeen).toBeInstanceOf(Date);
    expect(r.countries.length).toBeGreaterThan(0);
    expect(['video', 'image', 'playable', 'other']).toContain(r.type);
  });

  it('UTF-8 콘텐츠도 파싱한다', () => {
    const utf8 = Buffer.from(
      '"Advertiser App ID"\t"Advertiser App Name"\t"Creative URL"\t"Networks"\t"Duration"\t"First Seen"\t"Last Seen"\t"Impression Share"\t"Countries"\t"Type"\t"Format"\t"Placements"\t"Dimensions"\t"Video Duration"\n' +
        '"abc"\t"WHIF"\t"https://cdn.example.com/x"\t"TikTok"\t10\t"2026-06-01"\t"2026-07-01"\t0.5\t"TW,JP"\t"video"\t"other"\t"feed"\t"720x1280"\t15.2\n',
      'utf8',
    );
    const { rows, errors } = parseSensorTowerCreativeGalleryCsv(utf8);
    expect(errors).toHaveLength(0);
    expect(rows[0].advertiserAppName).toBe('WHIF');
    expect(rows[0].impressionShare).toBeCloseTo(0.5);
    expect(rows[0].countries).toEqual(['TW', 'JP']);
  });

  it('필수 컬럼(Creative URL) 없는 행은 오류 목록으로 분리한다', () => {
    const bad = Buffer.from(
      '"Advertiser App ID"\t"Advertiser App Name"\t"Creative URL"\t"Networks"\t"Duration"\t"First Seen"\t"Last Seen"\t"Impression Share"\t"Countries"\t"Type"\t"Format"\t"Placements"\t"Dimensions"\t"Video Duration"\n' +
        '"abc"\t"WHIF"\t""\t"TikTok"\t10\t"2026-06-01"\t"2026-07-01"\t0.5\t"TW"\t"video"\t"o"\t"f"\t"720x1280"\t15\n',
      'utf8',
    );
    const { rows, errors } = parseSensorTowerCreativeGalleryCsv(bad);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('행 2');
  });
});
```

- [ ] **Step 2: 실패 확인 → 구현**

`sensortower-csv.parser.ts` — 순수 함수, 의존성 없음:
```typescript
export interface SensorTowerCreativeRow {
  advertiserAppId: string;
  advertiserAppName: string;
  creativeUrl: string;
  networks: string[];
  durationDays: number | null;
  firstSeen: Date | null;
  lastSeen: Date | null;
  impressionShare: number | null;
  countries: string[];
  type: string;
  format: string;
  placements: string[];
  dimensions: string | null;
  videoDurationSeconds: number | null;
}

export interface ParseResult {
  rows: SensorTowerCreativeRow[];
  errors: string[];
}

/** Sensor Tower Unified Creative Gallery 내보내기 — 확장자는 .csv지만 실제로는 탭 구분,
 *  인코딩은 UTF-16LE(BOM) 또는 UTF-8. (2026-07 실물 파일 기준) */
export function parseSensorTowerCreativeGalleryCsv(buffer: Buffer): ParseResult {
  const text =
    buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe
      ? buffer.toString('utf16le').replace(/^﻿/, '')
      : buffer.toString('utf8').replace(/^﻿/, '');

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errors: string[] = [];
  const rows: SensorTowerCreativeRow[] = [];
  if (lines.length < 2) return { rows, errors: ['데이터 행이 없습니다'] };

  const unq = (s: string) => s.replace(/^"|"$/g, '').trim();
  const header = lines[0].split('\t').map(unq);
  const idx = (name: string) => header.indexOf(name);
  const required = ['Advertiser App Name', 'Creative URL', 'First Seen', 'Last Seen'];
  const missing = required.filter((c) => idx(c) < 0);
  if (missing.length > 0) return { rows, errors: [`필수 컬럼 누락: ${missing.join(', ')}`] };

  const num = (s: string) => (s === '' || Number.isNaN(Number(s)) ? null : Number(s));
  const date = (s: string) => (s === '' || Number.isNaN(Date.parse(s)) ? null : new Date(s));
  const list = (s: string) => (s === '' ? [] : s.split(',').map((x) => x.trim()).filter(Boolean));

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t').map(unq);
    const get = (name: string) => (idx(name) >= 0 ? (cols[idx(name)] ?? '') : '');
    const creativeUrl = get('Creative URL');
    if (!creativeUrl) {
      errors.push(`행 ${i + 1}: Creative URL 없음`);
      continue;
    }
    rows.push({
      advertiserAppId: get('Advertiser App ID'),
      advertiserAppName: get('Advertiser App Name'),
      creativeUrl,
      networks: list(get('Networks')),
      durationDays: num(get('Duration')),
      firstSeen: date(get('First Seen')),
      lastSeen: date(get('Last Seen')),
      impressionShare: num(get('Impression Share')),
      countries: list(get('Countries')),
      type: get('Type') || 'other',
      format: get('Format') || 'other',
      placements: list(get('Placements')),
      dimensions: get('Dimensions') || null,
      videoDurationSeconds: num(get('Video Duration')),
    });
  }
  return { rows, errors };
}
```

- [ ] **Step 3: 통과 확인**

Run: `pnpm --filter @babeloop/server test -- sensortower-csv`
Expected: PASS 3건

- [ ] **Step 4: Commit**

```bash
git add apps/server
git commit -m "feat: Sensor Tower Creative Gallery CSV 파서 (UTF-16LE/UTF-8, 탭 구분)"
```

---

### Task 9: CSV 임포트 + download-external-media

**Files:**
- Create: `apps/server/src/modules/source-ad/csv-import.service.ts`
- Modify: `source-ad.resolver.ts`(+`importSensorTowerCsv`), `source-ad.models.ts`(+`ImportResultModel`), `source-ad.inputs.ts`(+`ImportSensorTowerCsvInput`), `media-processing.processor.ts`
- Modify: `source-ad.module.ts` — `CsvImportService`를 providers에 추가하고 `BullModule.registerQueue`에 `MEDIA_PROCESSING_QUEUE`도 등록 (CsvImportService가 이 큐를 주입받음)
- Create: `apps/server/test/csv-import.e2e-spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`csv-import.e2e-spec.ts` — 외부 네트워크에 나가지 않도록 **Creative URL을 테스트 MinIO의 presigned GET URL로 대체**한 CSV를 합성한다:
```typescript
import { INestApplicationContext } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, createWorkerContext, stopContainers, TestApp } from './create-test-app';

const IMPORT = `mutation I($input: ImportSensorTowerCsvInput!) {
  importSensorTowerCsv(input: $input) { importedCount duplicateCount errors }
}`;

function makeCsv(url: string): string {
  return (
    '"Advertiser App ID"\t"Advertiser App Name"\t"Creative URL"\t"Networks"\t"Duration"\t"First Seen"\t"Last Seen"\t"Impression Share"\t"Countries"\t"Type"\t"Format"\t"Placements"\t"Dimensions"\t"Video Duration"\n' +
    `"app1"\t"WHIF"\t"${url}"\t"TikTok"\t30\t"2026-06-01"\t"2026-07-01"\t0.42\t"TW"\t"image"\t"other"\t"feed"\t"1x1"\t\n`
  );
}

describe('csv import', () => {
  let t: TestApp;
  let worker: INestApplicationContext;

  beforeAll(async () => {
    t = await createTestApp();
    worker = await createWorkerContext();
  });

  afterAll(async () => {
    await worker.close();
    await t.teardown();
    await stopContainers();
  });

  it('임포트 → SourceAd 생성 → 미디어 다운로드 → MediaAsset 연결', async () => {
    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    const { StorageService } = await import('../src/common/storage/storage.service');
    const prisma = t.app.get(PrismaService);
    const storage = t.app.get(StorageService);

    // 외부 CDN 대역: 테스트 MinIO에 이미지를 넣고 presigned GET URL을 Creative URL로 사용
    await storage.putBuffer('external/creative1.png', Buffer.from('fake-image-bytes'), 'image/png');
    const externalUrl = await storage.presignGet('external/creative1.png');

    await prisma.user.upsert({
      where: { email: 'csv@test.local' },
      update: {},
      create: { email: 'csv@test.local', passwordHash: await argon2.hash('pw-123456'), displayName: 'C', role: 'EDITOR' },
    });
    const agent = request.agent(t.app.getHttpServer());
    await agent.post('/graphql').send({ query: `mutation { login(email: "csv@test.local", password: "pw-123456") { id } }` });

    const fileBase64 = Buffer.from(makeCsv(externalUrl), 'utf8').toString('base64');
    const res = await agent.post('/graphql').send({ query: IMPORT, variables: { input: { fileBase64 } } });
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.importSensorTowerCsv.importedCount).toBe(1);

    // 워커가 다운로드를 끝낼 때까지 대기
    const deadline = Date.now() + 15_000;
    let ad = await prisma.sourceAd.findFirstOrThrow({ where: { provider: 'sensortower-csv' } });
    while (Date.now() < deadline && !ad.mediaAssetId) {
      await new Promise((r) => setTimeout(r, 300));
      ad = await prisma.sourceAd.findUniqueOrThrow({ where: { id: ad.id } });
    }
    expect(ad.mediaAssetId).not.toBeNull();
    expect(ad.isEstimated).toBe(true);
    expect(ad.impressionShare).toBeCloseTo(0.42);

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: ad.mediaAssetId! } });
    expect(asset.kind).toBe('IMAGE');

    // 같은 CSV 재임포트 → 전부 중복
    const again = await agent.post('/graphql').send({ query: IMPORT, variables: { input: { fileBase64 } } });
    expect(again.body.data.importSensorTowerCsv.importedCount).toBe(0);
    expect(again.body.data.importSensorTowerCsv.duplicateCount).toBe(1);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @babeloop/server test -- csv-import`
Expected: FAIL

- [ ] **Step 3: 구현**

`csv-import.service.ts`:
```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JobRecordService } from '../jobs/job-record.service';
import {
  downloadExternalMediaJobId,
  JOB_TYPES,
  MEDIA_PROCESSING_QUEUE,
} from '../../queues/queue.constants';
import { parseSensorTowerCreativeGalleryCsv } from './sensortower-csv.parser';

export interface ImportResult {
  importedCount: number;
  duplicateCount: number;
  errors: string[];
}

@Injectable()
export class CsvImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobRecord: JobRecordService,
    @InjectQueue(MEDIA_PROCESSING_QUEUE) private readonly mediaQueue: Queue,
  ) {}

  async importSensorTowerCsv(fileBase64: string, competitorId?: string): Promise<ImportResult> {
    const { rows, errors } = parseSensorTowerCreativeGalleryCsv(Buffer.from(fileBase64, 'base64'));
    let importedCount = 0;
    let duplicateCount = 0;

    for (const row of rows) {
      const existing = await this.prisma.sourceAd.findUnique({ where: { externalId: row.creativeUrl } });
      if (existing) {
        duplicateCount++;
        continue;
      }
      const ad = await this.prisma.sourceAd.create({
        data: {
          origin: 'SENSOR_TOWER_CSV',
          competitorId: competitorId ?? null,
          title: `${row.advertiserAppName} — ${row.type}`,
          sourceUrl: row.creativeUrl,
          externalId: row.creativeUrl,
          networks: row.networks,
          countries: row.countries,
          firstSeenAt: row.firstSeen,
          lastSeenAt: row.lastSeen,
          impressionShare: row.impressionShare,
          provider: 'sensortower-csv',
          observedAt: row.lastSeen,
          isEstimated: true,
          confidence: 'MEDIUM',
        },
      });
      importedCount++;

      // S3 링크는 만료되므로 즉시 다운로드 (설계 §4)
      const jobId = downloadExternalMediaJobId(ad.id);
      await this.mediaQueue.add(
        JOB_TYPES.DOWNLOAD_EXTERNAL_MEDIA,
        { sourceAdId: ad.id, url: row.creativeUrl, type: row.type },
        { jobId, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: false },
      );
      await this.jobRecord.enqueue(jobId, MEDIA_PROCESSING_QUEUE, JOB_TYPES.DOWNLOAD_EXTERNAL_MEDIA, {
        sourceAdId: ad.id,
      });
    }
    return { importedCount, duplicateCount, errors };
  }
}
```

`media-processing.processor.ts`의 `process()`를 job.name 분기로 확장:
```typescript
  async process(job: BullJob): Promise<void> {
    if (job.name === JOB_TYPES.DOWNLOAD_EXTERNAL_MEDIA) return this.downloadExternalMedia(job);
    return this.processMedia(job); // 기존 로직을 processMedia 메서드로 추출
  }

  private async downloadExternalMedia(
    job: BullJob<{ sourceAdId: string; url: string; type: string }>,
  ): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    try {
      const res = await fetch(job.data.url);
      if (!res.ok) throw new Error(`다운로드 실패: HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
      const kind = job.data.type === 'video' || contentType.startsWith('video/') ? 'VIDEO' : 'IMAGE';
      const storageKey = `source-ads/${job.data.sourceAdId}/original`;
      await this.storage.putBuffer(storageKey, buffer, contentType);
      const asset = await this.prisma.mediaAsset.create({
        data: {
          kind,
          status: 'UPLOADED',
          originalFilename: `external-${job.data.sourceAdId}`,
          contentType,
          sizeBytes: buffer.length,
          storageKey,
        },
      });
      await this.prisma.sourceAd.update({
        where: { id: job.data.sourceAdId },
        data: { mediaAssetId: asset.id },
      });
      await this.jobRecord.markSucceeded(jobId, { mediaAssetId: asset.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) await this.jobRecord.markFailed(jobId, message);
      throw error;
    }
  }
```

주의: `storageKey`는 `MediaAsset.storageKey` unique 제약과 충돌하지 않도록 sourceAdId 기반으로 결정적이다. 재시도 시 upsert가 아니라 create가 두 번 되지 않도록 — create 전에 `findFirst({where:{storageKey}})`로 기존 자산 재사용.

`source-ad.resolver.ts`에 mutation 추가:
```typescript
  @Mutation(() => ImportResultModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  importSensorTowerCsv(@Args('input') input: ImportSensorTowerCsvInput) {
    return this.csvImportService.importSensorTowerCsv(input.fileBase64, input.competitorId ?? undefined);
  }
```
`ImportSensorTowerCsvInput { fileBase64: String!, competitorId: ID? }`, `ImportResultModel { importedCount: Int, duplicateCount: Int, errors: [String!] }`.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @babeloop/server test -- csv-import`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat: Sensor Tower CSV 임포트 — 중복 차단, 미디어 즉시 다운로드 잡"
```

---

### Task 10: 분석→임베딩 프로세서 체인 + 유사 검색 GraphQL

**Files:**
- Create: `apps/server/src/modules/creative-analysis/analysis.service.ts`, `apps/server/src/queues/creative-analysis.processor.ts`, `embedding.processor.ts`
- Modify: `worker.module.ts`(큐·프로세서 등록), `creative-analysis.module.ts`(+`AnalysisService`), `source-ad.service.ts`(+`findSimilar` — `VectorSearchRepository`와 `EMBEDDING_PROVIDER` 주입 추가), `source-ad.resolver.ts`(+`similarSourceAds`), `source-ad.models.ts`(+`SimilarSourceAdModel`), `source-ad.inputs.ts`(+`SimilarSourceAdsInput`)
- Create: `apps/server/test/analysis-pipeline.e2e-spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`analysis-pipeline.e2e-spec.ts` (loginAs 헬퍼 동일):
```typescript
const CREATE_AD = `mutation C($input: CreateSourceAdInput!) {
  createSourceAd(input: $input) { sourceAd { id } job { id } }
}`;
const SIMILAR = `query S($input: SimilarSourceAdsInput!) {
  similarSourceAds(input: $input) { similarity sourceAd { id adText } }
}`;
```

테스트 2건 (worker 컨텍스트 기동, media-pipeline 테스트와 동일 대기 패턴):
1. **분석 체인**: adText "完全相同的廣告文案" 광고 A·B 2개 + "全然不同的內容因此向量不同" 광고 C 1개 등록 → 세 광고 모두 status가 `ANALYZED`가 될 때까지 폴링 (15초) → `creative_analyses` 행 존재 (provider 'mock', promptVersion 'analyze-creative@v1') → `ai_execution_logs`에 분석·임베딩 실행 기록 각각 존재
2. **유사 검색**: `similarSourceAds({sourceAdId: A.id, limit: 5})` → 첫 결과가 B (similarity ≈ 1.0, `toBeCloseTo(1, 3)`), C는 결과에 있어도 similarity가 B보다 낮음, A 자신은 결과에 없음

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @babeloop/server test -- analysis-pipeline`
Expected: FAIL

- [ ] **Step 3: 구현**

`analysis.service.ts` — 분석 입력 텍스트 조립 (분석·임베딩 프로세서가 공유):
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  /** adText + 연결 미디어의 OCR·전사 텍스트를 합쳐 분석·임베딩 입력을 만든다 */
  async buildInputText(sourceAdId: string): Promise<string> {
    const ad = await this.prisma.sourceAd.findUniqueOrThrow({
      where: { id: sourceAdId },
      include: { mediaAsset: { include: { ocrResults: true, transcriptions: true } } },
    });
    const parts = [
      ad.title,
      ad.adText,
      ...(ad.mediaAsset?.ocrResults.map((o) => o.text) ?? []),
      ...(ad.mediaAsset?.transcriptions.map((tr) => tr.text) ?? []),
    ].filter((x): x is string => Boolean(x && x.trim()));
    if (parts.length === 0) throw new Error('분석할 텍스트가 없습니다 — adText 또는 OCR/전사 결과 필요');
    return parts.join('\n');
  }
}
```

`creative-analysis.processor.ts`:
```typescript
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob, Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiExecutionLogService } from '../modules/ai-log/ai-execution-log.service';
import { AnalysisService } from '../modules/creative-analysis/analysis.service';
import { creativeAnalysisSchema, PROMPT_VERSION } from '../modules/creative-analysis/creative-analysis.schema';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { generateJsonWithRepair } from '../providers/text/generate-json-with-repair';
import { TEXT_GENERATION_PROVIDER, TextGenerationProvider } from '../providers/text/text-generation.provider';
import {
  CREATIVE_ANALYSIS_QUEUE,
  EMBEDDING_QUEUE,
  generateEmbeddingJobId,
  JOB_TYPES,
} from './queue.constants';

const SYSTEM_PROMPT =
  '너는 광고 크리에이티브 분석가다. 주어진 광고 텍스트를 분석해 지정된 JSON 스키마로만 응답한다.';

@Processor(CREATIVE_ANALYSIS_QUEUE)
export class CreativeAnalysisProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiLog: AiExecutionLogService,
    private readonly analysis: AnalysisService,
    private readonly jobRecord: JobRecordService,
    @Inject(TEXT_GENERATION_PROVIDER) private readonly textAi: TextGenerationProvider,
    @InjectQueue(EMBEDDING_QUEUE) private readonly embeddingQueue: Queue,
  ) {
    super();
  }

  async process(job: BullJob<{ sourceAdId: string }>): Promise<void> {
    const jobId = job.id!;
    const { sourceAdId } = job.data;
    await this.jobRecord.markRunning(jobId);
    try {
      await this.prisma.sourceAd.update({ where: { id: sourceAdId }, data: { status: 'ANALYZING' } });
      const inputText = await this.analysis.buildInputText(sourceAdId);

      const result = await this.aiLog.record(
        {
          provider: this.textAi.name,
          model: this.textAi.model,
          promptVersion: PROMPT_VERSION,
          inputRef: `sourceAd:${sourceAdId}`,
        },
        () => generateJsonWithRepair(this.textAi, { system: SYSTEM_PROMPT, prompt: inputText }, creativeAnalysisSchema),
      );

      await this.prisma.creativeAnalysis.create({
        data: {
          sourceAdId,
          summary: result.summary,
          hookText: result.hook.text ?? null,
          hookType: result.hook.type,
          ctaText: result.callToAction.text ?? null,
          ctaType: result.callToAction.type ?? null,
          targetAudience: result.targetAudience,
          emotionalTriggers: result.emotionalTriggers,
          genres: result.genres,
          language: result.language,
          raw: result,
          provider: this.textAi.name,
          model: this.textAi.model,
          promptVersion: PROMPT_VERSION,
        },
      });

      const embJobId = generateEmbeddingJobId(sourceAdId);
      await this.embeddingQueue.add(
        JOB_TYPES.GENERATE_EMBEDDING,
        { sourceAdId, inputText },
        { jobId: embJobId, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: false },
      );
      await this.jobRecord.enqueue(embJobId, EMBEDDING_QUEUE, JOB_TYPES.GENERATE_EMBEDDING, { sourceAdId });

      await this.jobRecord.markSucceeded(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.prisma.sourceAd.update({ where: { id: sourceAdId }, data: { status: 'FAILED' } });
        await this.jobRecord.markFailed(jobId, message);
      }
      throw error;
    }
  }
}
```

`embedding.processor.ts`:
```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiExecutionLogService } from '../modules/ai-log/ai-execution-log.service';
import { VectorSearchRepository } from '../modules/creative-analysis/vector-search.repository';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../providers/embedding/embedding.provider';
import { EMBEDDING_QUEUE } from './queue.constants';

@Processor(EMBEDDING_QUEUE)
export class EmbeddingProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiLog: AiExecutionLogService,
    private readonly vectors: VectorSearchRepository,
    private readonly jobRecord: JobRecordService,
    @Inject(EMBEDDING_PROVIDER) private readonly embedder: EmbeddingProvider,
  ) {
    super();
  }

  async process(job: BullJob<{ sourceAdId: string; inputText: string }>): Promise<void> {
    const jobId = job.id!;
    const { sourceAdId, inputText } = job.data;
    await this.jobRecord.markRunning(jobId);
    try {
      const vector = await this.aiLog.record(
        { provider: this.embedder.name, model: this.embedder.model, inputRef: `sourceAd:${sourceAdId}` },
        () => this.embedder.embed(inputText),
      );
      await this.vectors.upsertEmbedding({
        sourceAdId,
        model: this.embedder.model,
        dimension: this.embedder.dimension,
        vector,
      });
      await this.prisma.sourceAd.update({ where: { id: sourceAdId }, data: { status: 'ANALYZED' } });
      await this.jobRecord.markSucceeded(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.prisma.sourceAd.update({ where: { id: sourceAdId }, data: { status: 'FAILED' } });
        await this.jobRecord.markFailed(jobId, message);
      }
      throw error;
    }
  }
}
```

주의: `aiLog.record`의 output에 1536개 float 배열이 통째로 저장되면 로그가 비대해진다 — `AiExecutionLogService.record`의 output 기록을 `Array.isArray(result) ? { length: result.length } : result`로 요약하도록 `write` 호출부를 수정한다 (ai-execution-log.service.ts 한 줄 변경 + 기존 스펙 테스트에 배열 요약 케이스 1건 추가).

`worker.module.ts`: `BullModule.registerQueue({ name: CREATIVE_ANALYSIS_QUEUE }, { name: EMBEDDING_QUEUE })` 및 두 프로세서 providers 등록. `TextModule`, `EmbeddingModule`, `CreativeAnalysisModule`도 imports에.

`source-ad.resolver.ts`에 추가:
```typescript
  @Query(() => [SimilarSourceAdModel])
  async similarSourceAds(@Args('input') input: SimilarSourceAdsInput) {
    return this.sourceAdService.findSimilar(input.sourceAdId, input.limit ?? 5);
  }
```
`SimilarSourceAdsInput { sourceAdId: ID!, limit: Int? }`, `SimilarSourceAdModel { similarity: Float!, sourceAd: SourceAdModel! }`.

`source-ad.service.ts`에 `findSimilar`:
```typescript
  async findSimilar(sourceAdId: string, limit: number) {
    const model = this.embedder.model; // EMBEDDING_PROVIDER 주입
    const vector = await this.vectors.getEmbeddingVector(sourceAdId, model);
    if (!vector) {
      throw new GraphQLError('이 광고의 임베딩이 아직 없습니다 — 분석 완료 후 다시 시도하세요', {
        extensions: { code: 'EMBEDDING_NOT_READY' },
      });
    }
    const hits = await this.vectors.searchSimilar({ vector, model, limit, excludeSourceAdId: sourceAdId });
    const ads = await this.prisma.sourceAd.findMany({
      where: { id: { in: hits.map((h) => h.sourceAdId) } },
      include: SOURCE_AD_INCLUDE,
    });
    const byId = new Map(ads.map((a) => [a.id, a]));
    return hits.filter((h) => byId.has(h.sourceAdId)).map((h) => ({ similarity: h.similarity, sourceAd: byId.get(h.sourceAdId) }));
  }
```

- [ ] **Step 4: 통과 확인 + 전체 회귀**

Run: `pnpm --filter @babeloop/server test -- analysis-pipeline` → PASS
Run: `pnpm --filter @babeloop/server test` → 전부 PASS, 클린 종료

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat: 분석→임베딩 프로세서 체인과 pgvector 유사 광고 검색"
```

---

### Task 11: 웹 — 광고 페이지

**Files:**
- Create: `apps/web/src/pages/SourceAdsPage.tsx`
- Modify: `apps/web/src/App.tsx` (`/ads` 라우트 + 내비에 "광고" 링크)

- [ ] **Step 1: SourceAdsPage 작성**

구성 (기존 페이지들 패턴 유지, RHF 없이 단순 state로 충분):
```tsx
import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { graphql } from '../generated';
import { useJobPolling } from '../hooks/useJobPolling';

const SourceAdsDocument = graphql(`
  query SourceAds {
    sourceAds {
      id status title adText origin createdAt
      latestAnalysis { id summary hookType genres }
    }
  }
`);

const CreateSourceAdDocument = graphql(`
  mutation CreateSourceAd($input: CreateSourceAdInput!) {
    createSourceAd(input: $input) { sourceAd { id } job { id } }
  }
`);

const ImportCsvDocument = graphql(`
  mutation ImportCsv($input: ImportSensorTowerCsvInput!) {
    importSensorTowerCsv(input: $input) { importedCount duplicateCount errors }
  }
`);

const SimilarDocument = graphql(`
  query Similar($input: SimilarSourceAdsInput!) {
    similarSourceAds(input: $input) { similarity sourceAd { id title adText } }
  }
`);
```

- 등록 폼: title(선택)·adText(textarea)·sourceUrl(선택) → `createSourceAd` → 반환된 job.id를 `useJobPolling`에 걸고 완료 시 목록 refetch. 분석 잡 완료 후에도 임베딩 잡이 이어지므로, 폴링 완료 시 2초 후 한 번 더 refetch (status가 ANALYZED로 넘어가는 시점 보정).
- CSV 임포트: `<input type="file" accept=".csv">` → FileReader.readAsDataURL → base64 부분 추출 → `importSensorTowerCsv` → 결과 요약 문자열 표시 ("N건 임포트, M건 중복").
- 목록: 각 행에 상태 배지 + latestAnalysis 요약 + "유사 광고" 버튼. 버튼 클릭 시 `useLazyQuery(SimilarDocument)`로 조회해 해당 행 아래 인라인 목록(similarity 소수 2자리 + title/adText) 표시. `EMBEDDING_NOT_READY` 오류는 "분석이 끝나면 검색할 수 있습니다"로 표시.
- GraphQL enum을 쓸 일이 있으면 반드시 `import { ... } from '../generated/graphql'` (환경 제약 6).

`App.tsx`: `/ads` 라우트 추가, 내비에 `<Link to="/ads">광고</Link>` 추가 (브랜드 | 미디어 | 광고).

- [ ] **Step 2: 빌드 확인**

Run: `pnpm --filter @babeloop/server schema:emit && pnpm --filter @babeloop/web build`
Expected: 성공

- [ ] **Step 3: Commit**

```bash
git add apps/web
git commit -m "feat: 광고 등록·CSV 임포트·유사 광고 검색 화면"
```

---

### Task 12: E2E

**Files:**
- Create: `e2e/slice2.spec.ts`

- [ ] **Step 1: E2E 작성**

```typescript
import { expect, test } from '@playwright/test';

test('광고 2개 등록 → 분석 → 유사 광고 검색', async ({ page }) => {
  const stamp = Date.now();
  const sharedText = `完全相同的廣告文案-${stamp}`;

  await page.goto('/');
  await page.getByLabel('이메일').fill('admin@babeloop.local');
  await page.getByLabel('비밀번호').fill('changeme-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  await page.getByRole('link', { name: '광고' }).click();
  await expect(page.getByRole('heading', { name: '광고' })).toBeVisible();

  // 같은 문안으로 광고 A, B 등록
  for (const title of [`A-${stamp}`, `B-${stamp}`]) {
    await page.getByLabel('제목').fill(title);
    await page.getByLabel('광고 문구').fill(sharedText);
    await page.getByRole('button', { name: '광고 등록' }).click();
    await expect(page.getByText(title)).toBeVisible();
  }

  // 두 광고 모두 분석 완료 대기 (ANALYZED 배지)
  await expect(page.getByText('ANALYZED').first()).toBeVisible({ timeout: 30_000 });

  // A의 유사 광고 검색 → B가 나타난다
  const rowA = page.locator('li', { hasText: `A-${stamp}` });
  await expect(rowA.getByText('ANALYZED')).toBeVisible({ timeout: 30_000 });
  const rowB = page.locator('li', { hasText: `B-${stamp}` });
  await expect(rowB.getByText('ANALYZED')).toBeVisible({ timeout: 30_000 });

  await rowA.getByRole('button', { name: '유사 광고' }).click();
  await expect(rowA.getByText(`B-${stamp}`)).toBeVisible({ timeout: 10_000 });
});
```

주의: 목록 행은 `<li>`로 렌더링하고, 상태 배지 텍스트는 status enum 값 그대로(`ANALYZED`) 표시할 것 — E2E가 이 두 가지에 의존한다.

- [ ] **Step 2: 실행 확인**

Run: `pnpm e2e`
Expected: slice0·slice1·slice2 모두 passed

- [ ] **Step 3: Commit**

```bash
git add e2e
git commit -m "test: 슬라이스 2 완료 기준 E2E — 등록·분석·유사 검색"
```

---

## 슬라이스 2 완료 체크리스트

- [ ] `pnpm --filter @babeloop/server test` 전부 PASS + 클린 종료
- [ ] `pnpm e2e` — slice0·1·2 모두 passed
- [ ] 실물 ST CSV 픽스처 파싱 테스트 통과 (UTF-16LE)
- [ ] CSV 임포트 → 미디어 다운로드 → MediaAsset 연결 (통합 테스트)
- [ ] 동일 URL·동일 CSV 재등록 시 중복 차단
- [ ] 차원 불일치 저장 거부, 모델 혼합 검색 차단 (통합 테스트)
- [ ] AI 분석·임베딩 실행이 `ai_execution_logs`에 기록 (promptVersion 포함)

## 다음 슬라이스 예고

슬라이스 3 (생성): creative_briefs, generated_creatives, prompt_templates — 브랜드 가이드+분석 패턴 RAG로 브리프 생성, 문구 변형·스크립트 생성, zh-TW 현지화 초안. Mock Text Provider 재사용.

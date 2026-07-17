# OpenAI Provider 연결 (텍스트·임베딩) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mock으로 돌던 텍스트 생성·임베딩에 실제 OpenAI 구현체를 꽂는다. 토큰·비용이 `ai_execution_logs`에 실제로 기록되고, 임베딩 모델 전환에 따른 재임베딩 경로를 제공한다. **Provider 외의 도메인 로직·큐·화면은 변경 없음** — 그게 이 아키텍처의 존재 증명이다.

**설계 결정:**
- 공식 `openai` npm SDK 사용. 모든 텍스트 호출은 우리가 JSON을 요구하므로 `response_format: { type: 'json_object' }`.
- **모델명은 하드코드하지 않는다** — `TEXT_AI_MODEL`·`EMBEDDING_MODEL` 환경변수 (OpenAI 모델 개편에 코드가 흔들리지 않도록). 가격도 하드코드하지 않고 `TEXT_AI_USD_PER_MTOK_INPUT`/`_OUTPUT` 옵션 env — 없으면 costEstimateUsd는 null.
- 임베딩 차원은 스키마에 1536으로 박혀 있다 — **provider 부팅 시 첫 호출 전 검증이 아니라 응답 차원 검증**으로 강제 (차원 불일치는 저장 시점에 이미 VectorSearchRepository가 막지만, provider에서 더 이른 명시적 오류).
- 인터페이스 확장: `TextGenerationProvider.generate`가 `{ text, inputTokens?, outputTokens?, costEstimateUsd? }`를 반환. 임베딩 usage 기록은 이번 범위 외 (비용 미미 — TODO 주석만).
- 라이브 스모크 테스트는 **키가 있을 때만** 실행 (`TEXT_AI_API_KEY` 부재 시 skip) — CI·타인 환경에서 안전.

---

## 누적 환경 제약

슬라이스 5 계획서의 14개 항목 전부 동일 적용. 추가: 네트워크 호출은 샌드박스에서 불가 — OpenAI 실호출 테스트는 skip 처리 확인만 하고 Claude가 로컬 검증.

---

## 파일 구조 (추가/변경)

```
apps/server/src/providers/text/
├── text-generation.provider.ts        # TextGenerationOutput 반환형 확장
├── mock-text-generation.provider.ts   # { text } 반환으로 조정
├── openai-text-generation.provider.ts (+spec: 가짜 클라이언트 주입)
├── generate-json-with-repair.ts       # { data, usage } 반환 (attempt usage 합산)
└── text.module.ts                     # 'openai' 분기
apps/server/src/providers/embedding/
├── openai-embedding.provider.ts (+spec)
└── embedding.module.ts                # 'openai' 분기
apps/server/src/common/env.validation.ts
apps/server/src/queues/*.processor.ts  # generateJsonWithRepair 반환형 변화 반영 (4곳)
apps/server/src/modules/source-ad/     # reembedSourceAds mutation
apps/server/test/openai-smoke.e2e-spec.ts  # 키 있을 때만
.env.example
```

---

### Task 1: 의존성 + env 확장

- [ ] `pnpm --filter @babeloop/server add openai` (샌드박스 불가 시 package.json에 `"openai": "^4.80.0"` 직접 추가 — 메이저는 설치 시점 최신 확인)
- [ ] `env.validation.ts`:
```typescript
  TEXT_AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  TEXT_AI_API_KEY: z.string().optional(),
  TEXT_AI_MODEL: z.string().optional(),
  TEXT_AI_USD_PER_MTOK_INPUT: z.coerce.number().optional(),
  TEXT_AI_USD_PER_MTOK_OUTPUT: z.coerce.number().optional(),
  EMBEDDING_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
```
`.superRefine`으로 조건 검증: provider가 openai면 해당 API_KEY(+ TEXT_AI_MODEL) 필수 — 누락 시 부팅 중단 메시지에 어떤 env가 필요한지 명시.
- [ ] `.env.example`에 주석과 함께 추가 (키는 예시 값 넣지 말 것)
- [ ] Commit: `chore: openai SDK와 provider 선택 환경변수`

---

### Task 2: 인터페이스 확장 (usage 반환) — TDD

- [ ] `text-generation.provider.ts`:
```typescript
export interface TextGenerationOutput {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  costEstimateUsd?: number;
}
export interface TextGenerationProvider {
  readonly name: string;
  readonly model: string;
  generate(input: TextGenerationInput): Promise<TextGenerationOutput>;
}
```
- [ ] `generate-json-with-repair.ts` → 반환 `{ data: z.infer<T>; usage: { inputTokens?, outputTokens?, costEstimateUsd? } }` — repair 재시도 시 usage는 **두 호출 합산**. 기존 spec 3건 갱신 + 합산 케이스 1건 추가.
- [ ] Mock provider: `{ text: ... }` 반환으로 조정 (usage 없음).
- [ ] 호출부 4곳(creative-analysis·creative-generation×2·localization 프로세서) 갱신 — 패턴:
```typescript
const meta: AiExecutionMeta = { provider, model, promptVersion, inputRef };
const result = await this.aiLog.record(meta, async () => {
  const { data, usage } = await generateJsonWithRepair(this.textAi, {...}, schema);
  Object.assign(meta, usage); // record()는 fn 완료 후 meta를 기록하므로 반영된다
  return data;
});
```
(`ai-execution-log.service.ts`는 변경 불필요 — write가 fn 완료 후 meta를 스프레드하는 기존 구조 그대로. 이 전제가 깨져 있으면 record를 그렇게 수정)
- [ ] 전체 단위 테스트 GREEN 확인 → Commit: `feat: 텍스트 생성 usage 반환 — 토큰·비용이 AI 로그에 기록`

---

### Task 3: OpenAITextGenerationProvider — TDD (가짜 클라이언트 주입)

- [ ] spec: 생성자에 주입한 가짜 client로 — ①system/user 메시지·json_object 포맷으로 호출되는지 ②응답 content가 text로 ③usage 토큰 매핑 ④가격 env 있으면 costEstimateUsd 계산(`(in*inPrice + out*outPrice)/1e6`), 없으면 undefined ⑤API 오류는 그대로 throw (재시도는 BullMQ 몫)
- [ ] 구현:
```typescript
export class OpenAITextGenerationProvider implements TextGenerationProvider {
  readonly name = 'openai';
  readonly model = process.env.TEXT_AI_MODEL!;
  constructor(private readonly client: OpenAI = new OpenAI({ apiKey: process.env.TEXT_AI_API_KEY })) {}

  async generate(input: TextGenerationInput): Promise<TextGenerationOutput> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.prompt },
      ],
      response_format: { type: 'json_object' },
    });
    const text = res.choices[0]?.message?.content ?? '';
    const inputTokens = res.usage?.prompt_tokens;
    const outputTokens = res.usage?.completion_tokens;
    return { text, inputTokens, outputTokens, costEstimateUsd: this.cost(inputTokens, outputTokens) };
  }
  // cost(): 가격 env 둘 다 있을 때만 계산, 아니면 undefined
}
```
(responseHint는 OpenAI에선 사용하지 않음 — 프롬프트가 이미 스키마를 지시. 주석으로 명시)
- [ ] `text.module.ts` 분기: `kind === 'openai' → new OpenAITextGenerationProvider()`
- [ ] Commit: `feat: OpenAI 텍스트 생성 Provider`

---

### Task 4: OpenAIEmbeddingProvider — TDD (가짜 클라이언트 주입)

- [ ] spec: ①모델·입력 전달 ②1536이 아닌 응답 차원이면 명시적 오류(`임베딩 차원 불일치`) ③정상 벡터 반환
- [ ] 구현: `client.embeddings.create({ model, input: text })` → `data[0].embedding`, `dimension = 1536` 고정 검증. `embedding.module.ts` 분기.
- [ ] Commit: `feat: OpenAI 임베딩 Provider (1536 차원 강제)`

---

### Task 5: 재임베딩 mutation

- [ ] `source-ad.resolver.ts`에 `reembedSourceAds` (Roles ADMIN): ANALYZED 상태 전체 source ads에 대해 기존 `GENERATE_EMBEDDING` 잡 등록. payload `{ sourceAdId }`만 — **embedding.processor가 `inputText` 없으면 `AnalysisService.buildInputText`로 재구성**하도록 수정 (기존 잡 payload에는 inputText가 있어 그대로 동작 — 하위 호환). 반환: `{ enqueued: Int }`.
- [ ] 통합 테스트(기존 analysis-pipeline spec에 케이스 추가): mock 상태에서 reembed 실행 → 잡 완료 → creative_embeddings의 해당 모델 행 갱신 확인.
- [ ] Commit: `feat: 임베딩 모델 전환용 재임베딩 mutation`

---

### Task 6: 라이브 스모크 (키 있을 때만)

- [ ] `apps/server/test/openai-smoke.e2e-spec.ts`:
```typescript
const hasKey = Boolean(process.env.TEXT_AI_API_KEY && process.env.TEXT_AI_MODEL);
(hasKey ? describe : describe.skip)('openai live smoke', () => {
  it('실제 텍스트 생성이 JSON을 반환하고 usage가 채워진다', async () => { /* 직접 provider 인스턴스로 1회 호출 */ });
  it('실제 임베딩이 1536차원 벡터를 반환한다', async () => { /* EMBEDDING_API_KEY 조건 */ });
});
```
Testcontainers 불필요 — provider 단독 인스턴스. 타임아웃 30초.
- [ ] Commit: `test: OpenAI 라이브 스모크 (키 있을 때만 실행)`

---

## 완료 체크리스트

- [ ] `TEXT_AI_PROVIDER=mock`(기본)으로 기존 전체 테스트·E2E 전부 그대로 PASS (회귀 없음이 1순위)
- [ ] usage 합산·비용 계산 단위 테스트 PASS
- [ ] env 잘못 조합(openai인데 키 없음) 시 부팅 중단 + 명확한 메시지
- [ ] 키가 있으면: 라이브 스모크 2건 PASS + 실제 브리프 생성 1회에서 `ai_execution_logs`에 토큰·비용 기록 확인 (Claude 수동 검증)

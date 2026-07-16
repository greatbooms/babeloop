# BabeLoop 슬라이스 5 (성과) 구현 계획 — MVP 마지막 조각

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성과 CSV 업로드 → 추적코드 조인 → 소재(변형)별 퍼널 대시보드(데이터 그레인 정직 표시) → 성과 상위 패턴을 다음 브리프 생성에 환류. 완료 시 **스펙 26장 MVP 완료 조건 14단계 전체 충족.**

**Architecture:** 임포트는 동기 처리(행 수백 규모), `(date, platform, trackingCode)` 행 단위 upsert로 멱등 (설계 §11 — CSV 중복 업로드는 무해해야 한다). 가입·첫메시지 컬럼은 **빈 값 = "데이터 없음"이며 0과 다르다** — nullable로 저장하고 대시보드가 커버리지를 정직하게 표시한다 (설계 §7: 안분 금지, 그레인 숨기지 않기). 환류는 기존 `generate-brief` 잡에 `performanceContext`를 추가해 재사용한다.

**설계 문서와의 차이 (노트 필수):**
- `funnel_events` 테이블 생략 — MVP CSV는 일 단위 집계라 `performance_daily`로 충분. 이벤트 단위 데이터는 Snowflake/Airbridge 연동(post-MVP) 시 추가.
- 비용 통화는 `cost` + `currency`(기본 TWD) 단일 컬럼 쌍 — 환산은 대시보드 밖의 일.

---

## 누적 환경 제약

슬라이스 4 계획서의 14개 항목 전부 동일 적용.

---

## 성과 CSV 형식 (이 슬라이스가 정의하는 계약 — 파서·업로드 안내·테스트가 공유)

```csv
date,platform,tracking_code,impressions,clicks,installs,signups,first_messages,cost,currency
2026-07-01,META,BL-TW01-V1-R1,1000,50,10,5,3,2500,TWD
2026-07-01,META,BL-TW01-V2-R1,900,40,8,,,2200,TWD
```
- UTF-8, 쉼표 구분, 헤더 필수 (순서 무관, 컬럼명 고정)
- `signups`·`first_messages` 빈 값 허용 = 소재 단위 데이터 없음 (0 아님!)
- `platform`: META | TIKTOK | OTHER (대소문자 무관 매핑, 그 외 값은 오류 행)
- `tracking_code`: `parseTrackingCode()` 통과 필수 — 실패 시 오류 행
- `date`: YYYY-MM-DD

---

## 파일 구조 (추가/변경)

```
prisma/schema.prisma                      # PerformanceImport, PerformanceDaily
apps/server/src/modules/performance/
├── performance-csv.parser.ts (+spec)     # 순수 함수
├── performance.models.ts, .inputs.ts
├── performance.service.ts                # 임포트 upsert + variantPerformance 집계
├── performance.resolver.ts
└── performance.module.ts
apps/server/src/modules/generation/
├── brief.service.ts                      # requestBriefFromPerformance 추가
└── generation.prompts.ts                 # buildBriefPrompt에 performanceContext 섹션
apps/server/src/queues/creative-generation.processor.ts  # performanceContext 프롬프트 주입
apps/server/test/performance.e2e-spec.ts
apps/web/src/pages/PerformancePage.tsx
apps/web/src/App.tsx                      # /performance 라우트 + 내비 "성과"
e2e/slice5.spec.ts
```

---

### Task 1: Prisma 스키마 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 모델 추가** (`ExperimentVariant`에 `performance PerformanceDaily[]` 관계 추가)

```prisma
model PerformanceImport {
  id          String   @id @default(cuid())
  filename    String
  fileHash    String // 같은 파일 재업로드 감지용 (거부하지 않음 — upsert가 멱등)
  importedRows Int
  updatedRows  Int
  errorRows    Int
  errors       Json // [{row, message}]
  unmatchedTrackingCodes String[] // 파싱은 됐지만 변형이 없는 코드 (경고용)
  createdById String?
  createdAt   DateTime @default(now())

  @@index([fileHash])
  @@map("performance_imports")
}

enum AdPlatform {
  META
  TIKTOK
  OTHER
}

model PerformanceDaily {
  id                  String             @id @default(cuid())
  date                DateTime           @db.Date
  platform            AdPlatform
  trackingCode        String
  experimentVariantId String? // 조인 성공 시 — unmatched여도 데이터는 보존
  experimentVariant   ExperimentVariant? @relation(fields: [experimentVariantId], references: [id])
  impressions         Int?
  clicks              Int?
  installs            Int?
  // null = 소재 단위 데이터 없음 (0과 다름 — 안분·추정 금지, 설계 §7)
  signups             Int?
  firstMessages       Int?
  cost                Decimal?           @db.Decimal(14, 2)
  currency            String             @default("TWD")
  provider            String             @default("csv")
  isEstimated         Boolean            @default(false)
  confidence          Confidence         @default(HIGH)
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  @@unique([date, platform, trackingCode]) // 행 단위 upsert 키 — 멱등의 근거
  @@index([trackingCode])
  @@map("performance_daily")
}
```

- [ ] **Step 2: 마이그레이션**

Run: `pnpm prisma migrate dev --name slice5-performance`

- [ ] **Step 3: Commit** (Codex는 건너뜀)

```bash
git add prisma/ && git commit -m "feat: PerformanceImport·PerformanceDaily 스키마"
```

---

### Task 2: 성과 CSV 파서 (TDD)

**Files:**
- Create: `apps/server/src/modules/performance/performance-csv.parser.ts`, `performance-csv.parser.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — 케이스:
1. 정상 2행 파싱 (숫자·날짜·플랫폼 매핑 확인)
2. `signups`·`first_messages` 빈 값 → `null` (0이 아님을 명시적으로 단언)
3. 잘못된 추적코드 행 → errors에 행 번호 + 사유, 정상 행은 계속 처리
4. 잘못된 platform / 잘못된 date → 오류 행
5. 필수 헤더 누락 → 전체 오류
6. 음수 숫자 → 오류 행
7. `platform` 소문자(`meta`) → META로 매핑

- [ ] **Step 2: 구현** — 순수 함수, ST 파서와 같은 스타일:

```typescript
export interface PerformanceRow {
  date: Date;
  platform: 'META' | 'TIKTOK' | 'OTHER';
  trackingCode: string;
  impressions: number | null;
  clicks: number | null;
  installs: number | null;
  signups: number | null;
  firstMessages: number | null;
  cost: number | null;
  currency: string;
}

export function parsePerformanceCsv(buffer: Buffer): { rows: PerformanceRow[]; errors: string[] }
```
핵심 규칙: 빈 문자열 → null, 숫자면 `Number.isInteger && >= 0` 검증(cost는 소수 허용 `>= 0`), `parseTrackingCode(...)`가 null이면 오류 행, 헤더는 이름 기준 인덱싱(순서 무관). `date`는 `/^\d{4}-\d{2}-\d{2}$/` + `Date.parse` 검증.

- [ ] **Step 3: 통과 확인 → Commit**

```bash
git add apps/server && git commit -m "feat: 성과 CSV 파서 — 빈 값은 null (데이터 없음 ≠ 0)"
```

---

### Task 3: 임포트 + 퍼널 집계 GraphQL

**Files:**
- Create: `apps/server/src/modules/performance/performance.models.ts`, `.inputs.ts`, `performance.service.ts`, `performance.resolver.ts`, `performance.module.ts`
- Modify: `app.module.ts`, `generate-schema.ts`

- [ ] **Step 1: PerformanceService 구현**

`importCsv(user, fileBase64, filename)`:
1. sha256 해시 → 같은 해시의 기존 임포트 존재 여부 확인 (기록용 — 거부하지 않음)
2. `parsePerformanceCsv` → 행마다:
   - `experimentVariant.findUnique({where: {trackingCode}})` → 없으면 `unmatchedTrackingCodes`에 추가 (행은 그래도 저장)
   - `performanceDaily.upsert({ where: { date_platform_trackingCode: {...} }, update: {전 지표 + experimentVariantId}, create: {...} })` — 생성이면 importedRows++, 갱신이면 updatedRows++ (upsert 전 `findUnique`로 구분)
3. `performance_imports` 행 생성, 결과 반환: `{importedRows, updatedRows, errorRows, errors, unmatchedTrackingCodes, duplicateFile: boolean}`

`variantPerformance(experimentId)` — 변형별 집계:
```typescript
// 커버리지 규칙: 소재 단위 데이터가 어느 정도 있는지 정직하게 표시 (설계 §7)
// FULL: 모든 행에 값 존재 / PARTIAL: 일부 행만 / MISSING: 전무
type Coverage = 'FULL' | 'PARTIAL' | 'MISSING';
```
변형마다: 합계(sum, null 행 제외), 파생 지표(0 나눗셈은 null):
- `ctr = clicks/impressions`, `cpi = cost/installs`, `costPerSignup = cost/signups`
- `installToSignupRate = signups/installs`, `signupToFirstMessageRate = firstMessages/signups`
- coverage: `signupsCoverage`, `firstMessagesCoverage` (위 규칙)
- 정렬: **signups 합계 내림차순, null은 뒤로** (설치보다 가입 — 설계 원칙 11), 동률이면 installs
- 반환에 creative 요약(hookType, koreanText 앞 60자, status) 포함

`performance.resolver.ts`: Mutation `importPerformanceCsv`(Roles ADMIN/EDITOR/REVIEWER — 스펙 §19 성과 업로드는 마케터 몫이지만 역할 4개 체계에선 EDITOR가 마케터), Query `variantPerformance(experimentId)`, `performanceImports`. **generate-schema.ts에 PerformanceResolver 추가.**

- [ ] **Step 2: 컴파일 확인 → Commit**

```bash
git add apps/server && git commit -m "feat: 성과 CSV 임포트(멱등 upsert)와 변형별 퍼널 집계·커버리지"
```

---

### Task 4: 브리프 환류

**Files:**
- Modify: `apps/server/src/modules/generation/brief.service.ts`, `brief.resolver.ts`, `brief.inputs.ts`, `generation.prompts.ts`, `apps/server/src/queues/creative-generation.processor.ts`

- [ ] **Step 1: 구현**

`brief.service.ts`에 추가 — `requestBriefFromPerformance(user, experimentId)`:
1. 해당 실험 변형들의 성과 집계 (PerformanceService 재사용 또는 동일 로직) → **가입 합계 1위** 변형 선택 (전부 null이면 설치 1위, 그것도 없으면 `NO_PERFORMANCE_DATA` 오류)
2. 그 변형의 creative + 브리프 로드
3. 기존 `generate-brief` 잡 등록 — payload에 추가:
```typescript
performanceContext: {
  trackingCode, hookType: creative.hookType, koreanText: creative.koreanText,
  signups, installs, clicks, impressions,
}
```
4. `focusText`는 상위 변형의 `koreanText` — RAG가 유사 경쟁 광고도 자동으로 다시 찾는다 (기존 경로 재사용)

`generation.prompts.ts`의 `buildBriefPrompt`에 옵션 파라미터 추가:
```typescript
performanceSection?: string;
// 있으면: `## 검증된 자체 성과 패턴 (이 패턴을 발전시켜라)\n${performanceSection}` 섹션 삽입
```

`creative-generation.processor.ts`의 generateBrief: payload.performanceContext가 있으면
`performanceSection = \`추적코드 ${trackingCode} — 훅: ${hookType}, 가입 ${signups ?? '?'}건/설치 ${installs ?? '?'}건\n문구: ${koreanText}\``
브리프 생성 후 `creativeBrief.raw`에 performanceContext도 저장 (환류 근거 감사 추적).

`brief.resolver.ts`: Mutation `generateBriefFromPerformance(input {experimentId})` → `{job}`.

- [ ] **Step 2: 컴파일 확인 → Commit**

```bash
git add apps/server && git commit -m "feat: 성과 상위 변형을 다음 브리프 생성에 환류"
```

---

### Task 5: 통합 테스트

**Files:**
- Create: `apps/server/test/performance.e2e-spec.ts`

- [ ] **Step 1: 작성** (Testcontainers — 준비: prisma로 experiment + variant(trackingCode 'BL-PERF-V1-R1' 등 2개) + 연결 creative·brief 직접 삽입, worker 컨텍스트)

시나리오:
1. **임포트·조인**: 변형 2개짜리 CSV(V1은 signups 있음, V2는 signups 빈 값) 업로드 → importedRows/errorRows 확인 → `performance_daily`에 V2.signups IS NULL (0 아님) → variantPerformance: V1이 첫 번째(가입 정렬), V1 `signupsCoverage: 'FULL'`, V2 `'MISSING'`, ctr·cpi 계산값 검증
2. **멱등**: 같은 CSV 재업로드 → `duplicateFile: true`, importedRows 0·updatedRows 2, `performance_daily` 행 수 불변, 값 동일
3. **수정 반영**: 같은 (date,platform,code)에 installs만 바꾼 CSV → 값 갱신, 행 수 불변
4. **불량 행**: 잘못된 추적코드·음수·미지의 platform 섞인 CSV → errors에 행 번호별 사유, 정상 행만 반영, unmatchedTrackingCodes에 변형 없는 코드
5. **환류**: `generateBriefFromPerformance(experimentId)` → 잡 완료 대기 → 새 브리프 생성 확인, `brief.raw.performanceContext.trackingCode === 'BL-PERF-V1-R1'` (가입 1위), `ai_execution_logs`의 해당 실행 존재
6. **데이터 없음**: 성과 0행 실험에 환류 요청 → `NO_PERFORMANCE_DATA`

- [ ] **Step 2: 실행 (로컬 검증 시) → Commit**

```bash
git add apps/server/test && git commit -m "test: 성과 임포트 멱등·커버리지·환류 통합 검증"
```

---

### Task 6: 웹 — 성과 페이지

**Files:**
- Create: `apps/web/src/pages/PerformancePage.tsx`
- Modify: `apps/web/src/App.tsx` (라우트 `/performance`, 내비 "성과")

- [ ] **Step 1: 구현** (기존 페이지 패턴, dialog 금지)

- **CSV 업로드**: `<input type="file" accept=".csv">` (label "성과 CSV") + 버튼 "성과 업로드" → base64 → `importPerformanceCsv` → 결과 요약 표시: "신규 N행, 갱신 M행, 오류 K행" + 오류 목록 + unmatched 코드 경고. CSV 형식 안내를 페이지에 고정 텍스트로 표시 (헤더 한 줄 예시).
- **실험 선택** (label "실험", experiments 쿼리 드롭다운) → `variantPerformance` 테이블 렌더. 행(`<tr>` — 이번엔 표): 추적코드 | 훅 | 노출 | 클릭 | CTR | 설치 | CPI | **가입** | 첫메시지 | 비용. 가입·첫메시지 셀: 커버리지 MISSING이면 값 대신 **"소재 단위 없음"** 배지(설계 §7의 정직 표시 — 0으로 보여주지 말 것), PARTIAL이면 값+"(부분)" 표기.
- **환류**: 버튼 "이 성과로 브리프 생성" → `generateBriefFromPerformance` → `useJobPolling` → 완료 시 "브리프가 생성되었습니다 — 브리프 탭에서 확인" 메시지.
- E2E 계약: 페이지 제목 `<h1>성과</h1>`, 위 label·버튼 이름, 테이블 내 추적코드 텍스트 노출.

- [ ] **Step 2: 빌드 확인 → Commit**

```bash
git add apps/web && git commit -m "feat: 성과 업로드·퍼널 대시보드·브리프 환류 화면"
```

---

### Task 7: E2E — MVP 루프 완주

**Files:**
- Create: `e2e/slice5.spec.ts`

- [ ] **Step 1: 작성** — 슬라이스 4 E2E와 같은 준비 흐름(광고→브리프→변형→검수·승인→실험→내보내기, 계정 전환 포함)을 압축 재사용한 뒤:

```typescript
// (준비 완료 후 — expCode의 BL-{expCode}-V1-R1이 EXPORTED 상태)
await page.getByRole('link', { name: '성과' }).click();
await expect(page.getByRole('heading', { name: '성과' })).toBeVisible();

const csv = [
  'date,platform,tracking_code,impressions,clicks,installs,signups,first_messages,cost,currency',
  `2026-07-10,META,BL-${expCode}-V1-R1,1000,50,10,5,3,2500,TWD`,
  `2026-07-11,META,BL-${expCode}-V1-R1,1200,66,12,7,4,3000,TWD`,
].join('\n');
await page.getByLabel('성과 CSV').setInputFiles({
  name: 'perf.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8'),
});
await page.getByRole('button', { name: '성과 업로드' }).click();
await expect(page.getByText('신규 2행')).toBeVisible({ timeout: 15_000 });

await page.getByLabel('실험').selectOption({ label: `E2E 실험 ${tag}` });
const row = page.locator('tr', { hasText: `BL-${expCode}-V1-R1` });
await expect(row.getByText('2200')).toBeVisible();   // 노출 합계
await expect(row.getByText('12', { exact: true })).toBeVisible(); // 가입 합계 5+7
await page.getByRole('button', { name: '이 성과로 브리프 생성' }).click();
await expect(page.getByText('브리프가 생성되었습니다')).toBeVisible({ timeout: 30_000 });

// 환류 브리프가 실제로 목록에 생겼는지
await page.getByRole('link', { name: '브리프' }).click();
await expect(page.locator('li', { hasText: '[MOCK 브리프]' }).first()).toBeVisible({ timeout: 15_000 });
```
(가입 합계 12 확인: 노출 합계 2200과 "12" 텍스트 충돌 주의 — 셀 단위 locator로 좁힐 것. 준비 흐름의 셀렉터는 slice4.spec.ts에서 복사하되 tag는 이 테스트의 것)

`test.setTimeout(240_000)` — 전체 루프라 가장 긴 테스트.

- [ ] **Step 2: 실행 확인**

Run: `pnpm e2e`
Expected: slice0~5 전부 passed — **이것이 곧 스펙 26장 MVP 완료 조건 검증이다**

- [ ] **Step 3: Commit**

```bash
git add e2e && git commit -m "test: 슬라이스 5 E2E — 성과 업로드·퍼널·환류 (MVP 루프 완주)"
```

---

### Task 8: README·설계 문서 갱신

- [ ] **Step 1: README에 성과 CSV 형식 섹션 추가** (위 계약 그대로)
- [ ] **Step 2: 설계 문서 12장 빌드 순서 표에 슬라이스 0~5 완료 표기** (각 행 끝에 `✅ 완료 (2026-07-XX)`)
- [ ] **Step 3: Commit**

```bash
git add README.md docs/ && git commit -m "docs: MVP 완료 — 성과 CSV 계약과 슬라이스 완료 표기"
```

---

## 슬라이스 5 완료 체크리스트 (= MVP 완료)

- [ ] CSV 멱등 재업로드 (행 수 불변, duplicateFile 표시)
- [ ] 가입 빈 값이 null로 저장되고 대시보드에 "소재 단위 없음"으로 표시 (0 아님)
- [ ] 퍼널 정렬이 가입 기준 (설치 아님 — 설계 원칙 11)
- [ ] 환류 브리프의 raw에 performanceContext 기록 (감사 추적)
- [ ] 전체 테스트 + E2E 6종 PASS
- [ ] **스펙 26장 14단계가 E2E로 전부 커버됨**

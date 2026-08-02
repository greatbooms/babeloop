# EXPORTED 상태 제거 — 승인이 종착, 내보내기는 실험 단위 사건

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법.

**Goal (사용자 승인 완료):** 문구(GeneratedCreative)의 라이프사이클은 APPROVED에서 끝난다. "내보냄"은 문구의 전역 상태가 아니라 실험 변형(ExperimentVariant)의 사건(`exportedAt`)으로 기록한다. 이로써 ① EXPORTED 문구를 다른 실험에 재사용하면 내보내기에서 조용히 빠지는 모순 해소 ② "내보내면 못 쓴다"로 읽히는 혼란 제거 ③ 내보내기는 언제든 전체 패키지를 재생성할 수 있는 멱등 동작이 된다(추적코드는 변형별 고정이라 안전).

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가 → 마이그레이션 SQL 수동 작성만. 적용은 Claude.
- AI 라이브 호출 0. pnpm install·docker·테스트 실행이 샌드박스에서 실패하면 건너뛰고 실행할 명령 목록으로 보고.
- **Playwright e2e 6종(e2e/slice0~5.spec.ts)은 무수정 통과가 합격선 — 스펙 파일을 수정하지 말 것.** (EXPORTED 미참조 확인됨)
- 서버 통합 테스트 2곳(review-flow, performance)은 의도된 구조 변경으로 갱신 대상.
- UI 문자열은 전부 i18n(messages.ts ko+zhTw). 기존 한국어 라벨·mock 문자열 불변.
- 서버 포트는 16000(.env PORT) — 하드코딩 3000 쓰지 말 것.

---

## Task 1: Prisma 스키마 + 수동 마이그레이션 SQL

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260802000000_remove_exported_status/migration.sql`(신규)

- [ ] schema.prisma: `enum CreativeStatus`에서 `EXPORTED` 제거. `enum ReviewEventKind`의 `EXPORTED`는 유지(이력 로그용). `model ExperimentVariant`에 `exportedAt DateTime?` 추가.
- [ ] migration.sql (이 순서대로):
  1. `ALTER TABLE "experiment_variants" ADD COLUMN "exportedAt" TIMESTAMP(3);`
  2. 백필 — 내보내기 이력이 있는 실험의 변형 중 당시 EXPORTED였던 문구의 변형: `UPDATE "experiment_variants" ev SET "exportedAt" = p.first_export FROM (SELECT "experimentId", MIN("createdAt") AS first_export FROM "export_packages" GROUP BY "experimentId") p WHERE p."experimentId" = ev."experimentId" AND ev."creativeId" IN (SELECT id FROM "generated_creatives" WHERE status = 'EXPORTED');`
  3. `UPDATE "generated_creatives" SET status = 'APPROVED' WHERE status = 'EXPORTED';`
  4. enum 재생성: `CREATE TYPE "CreativeStatus_new" AS ENUM ('DRAFT','POLICY_CHECKED','IN_REVIEW','LOCALIZATION_APPROVED','APPROVED','REVISION_REQUESTED','REJECTED');` → `ALTER TABLE "generated_creatives" ALTER COLUMN "status" DROP DEFAULT;` → `ALTER TABLE "generated_creatives" ALTER COLUMN "status" TYPE "CreativeStatus_new" USING ("status"::text::"CreativeStatus_new");` → `ALTER TABLE "generated_creatives" ALTER COLUMN "status" SET DEFAULT 'DRAFT';` → `DROP TYPE "CreativeStatus";` → `ALTER TYPE "CreativeStatus_new" RENAME TO "CreativeStatus";`
- [ ] `npx prisma generate` 실행(가능하면). 실패 시 보고.

## Task 2: 서버 로직

**Files:** `apps/server/src/modules/review/creative-state-machine.ts`, `apps/server/src/modules/experiment/export.service.ts`, `apps/server/src/modules/experiment/experiment.service.ts`, `apps/server/src/modules/experiment/*.models.ts`(변형 GraphQL 모델)

- [ ] state machine: `APPROVED: []`(종착). `EXPORTED` 키·타입 참조 제거.
- [ ] export.service.ts:
  - 대상 = 실험의 **모든 변형**(안전망으로 `creative.status === 'APPROVED'` 필터는 유지 — addCreative가 APPROVED만 받으므로 사실상 전부).
  - 변형 0개일 때 기존 에러 메시지 "내보낼 승인된 소재가 없습니다"(code NO_APPROVED_CREATIVES) 그대로 유지.
  - 문구 상태 전이(EXPORTED로 update) 삭제. 대신 내보낸 변형들의 `exportedAt = new Date()` 갱신(재내보내기 시에도 갱신 — 멱등 전체 재생성).
  - reviewEvents `EXPORTED` 이벤트 기록은 유지(이력 로그, note에 실험 코드 포함 권장).
- [ ] experiment.service.ts addCreative: `creative.status !== 'APPROVED'`면 거부로 단순화. 주석 갱신: "내보낸 이력이 있어도 상태는 APPROVED이므로 재사용에 제약 없음. 같은 실험 중복만 금지."
- [ ] GraphQL: ExperimentVariant 모델에 `exportedAt: Date | null` 노출(실험 상세 쿼리 + 검토 상세의 experimentVariants 매핑 포함).

## Task 3: 웹

**Files:** `apps/web/src/lib/status-labels.ts`, `apps/web/src/pages/ExperimentDetailPage.tsx`, `apps/web/src/pages/ReviewDetailPage.tsx`, `apps/web/src/i18n/messages.ts`, `apps/web/src/lib/full-guide.ts`

- [ ] status-labels.ts: EXPORTED 항목 제거. (ReviewPage 상태 필터는 codegen enum에서 자동 제거됨)
- [ ] ExperimentDetailPage:
  - AddableCreatives 쿼리에서 `exported: creatives(status: EXPORTED)` 별칭 제거, approved만 사용하도록 정리.
  - 변형 테이블에 「내보냄」 열 추가: `exportedAt` 있으면 formatDate(lang), 없으면 '—'. 헤더 라벨 i18n 키 신설(예: experiments.exportedAtColumn ko '내보냄' / zh '已匯出').
- [ ] ReviewDetailPage: experimentVariants 표시부에 exportedAt 있으면 내보낸 날짜 병기(작게).
- [ ] messages.ts (ko+zh): experiments.membershipRules·description 등 "내보냄/EXPORTED" 언급 문구를 새 의미로 갱신 — "승인이 종착 상태이며, 내보내기는 실험 단위로 언제든 재생성 가능. 같은 문구를 여러 실험에 재사용 가능(같은 실험 중복만 불가)."
- [ ] full-guide.ts (ko+zh): 5단계 states `'승인 APPROVED (종착) — 내보내기는 실험 단위 기록'` / zh 대응, tips에서 EXPORTED 서술 갱신. 4단계(검토)에 내보냄 상태 언급 있으면 함께 정리.

## Task 4: 서버 통합 테스트 갱신 (의도된 변경)

**Files:** `apps/server/test/review-flow.e2e-spec.ts`, `apps/server/test/performance.e2e-spec.ts`

- [ ] review-flow(:349 부근): 내보내기 후 `creative.status === 'APPROVED'` 유지 + 해당 변형들의 `exportedAt`이 설정됨을 단언으로 교체. **재내보내기 시나리오 추가**: 같은 실험을 두 번째 export → 성공(파일 재생성)하고 exportedAt 갱신됨.
- [ ] performance.e2e-spec(:92): 시드 status `'EXPORTED'` → `'APPROVED'`.
- [ ] 그 외 EXPORTED 문자열 잔존 검색(`grep -rn EXPORTED apps/ e2e/ prisma/`)해 정리(ReviewEventKind 관련은 유지).

## Task 5: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용, prisma generate, build, 서버 테스트 전체, Playwright e2e 6종(무수정) 통과
- [ ] 브라우저: 검토에서 내보냄 배지 사라짐 / 실험 상세 변형 테이블 내보냄 열 / 재내보내기 동작 / EXPORTED였던 기존 문구가 승인됨으로 보이고 새 실험 추가·내보내기 가능
- [ ] 커밋

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다르게 구현한 부분, 테스트 갱신 내역.

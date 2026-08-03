# Snowflake 성과 자동 동기화 — 성과 탭 수동 버튼 + 주기 크론

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** CLI 스크립트가 아니라 어드민 안에서: ① 성과 탭 「Snowflake에서 지금 가져오기」 버튼(잡 처리·진행 표시) ② 자격증명이 설정되면 매일 자동 동기화(크론) ③ 미설정 상태에선 비활성 카드 + 안내. 소재별 가입(signups)을 first-touch 귀속으로 집계해 기존 성과 임포트 파이프라인(검증·중복·이력)을 통과시킨다.

**참조 구현:** `scripts/perf-from-snowflake.mjs` — 연결 옵션(비밀번호/키페어 JWT), 추출 SQL(TO_JSON 정규식 `BL-[A-Z0-9]+-V[0-9]+-R[0-9]+`, first-touch, USERS 조인)을 그대로 서버로 옮기면 된다. CSV 텍스트를 만들어 기존 `performanceService.importCsv`(user, fileBase64, filename)를 재사용하는 게 가장 안전하다 (중복 파일 스킵·미매칭 보고·이력 무료 획득).

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). AI 라이브 호출 0. **실제 Snowflake 접속도 금지** — 자격증명이 없으므로 mock 소스로만 검증. pnpm install 필요 시 snowflake-sdk를 apps/server 의존성으로 추가(루트에는 이미 있음).
- **테스트·e2e에서 실제 Snowflake에 붙지 않게**: 자격증명 없으면 기능이 휴면(dormant)이 기본 — create-test-app/e2e:stack에는 SNOWFLAKE_* 가 없으므로 자동 안전. 단 유닛 테스트용 mock 소스는 DI로 주입 가능해야 한다.
- Playwright e2e 6종 무수정 통과 (slice5가 성과 페이지를 지나간다 — 기존 셀렉터·문자열 불변, 새 카드는 추가만). 서버 포트 16000.
- UI 문자열 전부 i18n(ko+zhTw), 기존 디자인 체계(Card·Button·잡 폴링) 재사용. BullMQ jobId 구분자 `--`, enqueueOrRetry.

---

## Task 1: Snowflake 성과 소스 프로바이더

**Files:** `apps/server/src/providers/perf-source/perf-source.provider.ts`(신규 인터페이스+토큰), `snowflake-perf-source.provider.ts`, `mock-perf-source.provider.ts`, `perf-source.module.ts`, app/worker 모듈 등록, `apps/server/package.json`(snowflake-sdk), `env.validation.ts`(optional SNOWFLAKE_*), `.env.example`은 이미 문서화됨

- [ ] 인터페이스: `configured: boolean` + `fetchSignups(input: { from: string; to: string }): Promise<Array<{ date: string; trackingCode: string; signups: number }>>` + `name`.
- [ ] snowflake 구현: env(SNOWFLAKE_ACCOUNT/USERNAME/PASSWORD 또는 PRIVATE_KEY_PATH(+PASSPHRASE)/ROLE/WAREHOUSE/DATABASE 기본 BABECHAT_TW) 없으면 `configured=false`(연결 시도 금지). 쿼리는 scripts/perf-from-snowflake.mjs의 extract SQL과 동일(WEB_EVENTS TO_JSON 정규식 → first-touch → USERS 조인). 연결은 호출 시 생성·종료(상시 커넥션 금지), 타임아웃 60초.
- [ ] mock 구현: `PERF_SOURCE_PROVIDER=mock`일 때 사용 — 결정적 2행 반환(`[MOCK]` 없이 실존 형식: 오늘 날짜, 'BL-MOCK-V1-R1', signups 3 등). configured=true.
- [ ] 선택 로직: PERF_SOURCE_PROVIDER=mock → mock, 그 외 → snowflake(자격증명 없으면 dormant).
- [ ] 유닛 테스트: mock 반환 형태 1건.

## Task 2: 동기화 잡 + 뮤테이션 + 상태 쿼리 + 크론

**Files:** `queue.constants.ts`(SYNC_PERFORMANCE 잡·jobId), `apps/server/src/queues/performance-sync.processor.ts`(신규— 기존 큐 재사용해도 됨: policy-check 큐 말고 적절한 큐 선택 or 신규 큐 등록), `performance.resolver.ts`·`performance.service.ts`·`performance.models.ts`, `apps/server/src/worker.ts`(또는 scheduler) 크론 등록

- [ ] 뮤테이션 `syncPerformanceFromSnowflake(input: { from: String, to: String } — 선택, 기본 최근 14일) → JobModel`: 소스 미설정이면 GraphQLError('Snowflake 자격증명이 설정되지 않았습니다', code 'NOT_CONFIGURED'). enqueueOrRetry, jobId `sync-performance--{uuid}`.
- [ ] 프로세서: provider.fetchSignups → 행이 0이면 성공 처리(result에 rows:0) → CSV 텍스트 조립(기존 헤더 10열, signups 외 빈 값, platform OTHER, currency TWD) → `performanceService.importCsv(시스템 유저 or requestedBy, base64, 'snowflake-sync-{from}_{to}.csv')` 재사용 → markSucceeded(result: importedRows·updatedRows·unmatched 개수).
- [ ] 쿼리 `performanceSyncStatus → { configured: Boolean!, provider: String!, cron: String, lastSyncedAt: DateTime }`: configured=소스 configured, cron=PERF_SYNC_CRON 값, lastSyncedAt=filename이 'snowflake-sync-'로 시작하는 최신 임포트의 createdAt.
- [ ] 크론: worker 기동 시 소스 configured && `PERF_SYNC_CRON`(기본 '0 7 * * *', tz 'Asia/Taipei') → BullMQ repeatable job 등록(최근 14일 윈도). 미설정이면 등록 안 함. 중복 등록 방지(removeRepeatable 후 add 또는 jobId 고정).
- [ ] 유닛 테스트: 프로세서가 mock 소스 2행을 importCsv로 넘기는지 1건, 미설정 뮤테이션 거부 1건.

## Task 3: 성과 탭 UI 카드

**Files:** `apps/web/src/pages/PerformancePage.tsx`(구조 확인 후 카드 추가), 관련 css, `messages.ts`(ko+zhTw), `full-guide.ts` 성과 단계 tips 갱신(스크립트 안내 → 어드민 버튼 안내로)

- [ ] 「Snowflake 동기화」 카드: configured=false면 버튼 비활성 + 안내('서버 .env에 SNOWFLAKE_* 자격증명을 설정하면 활성화됩니다'). configured=true면 「지금 가져오기」 버튼(무료·잡 폴링, 완료 시 임포트 결과 요약 표시 + refetch), 마지막 동기화 시각, 크론 주기 표시('매일 07:00 자동 동기화' — cron 값 기반, 없으면 '자동 동기화 꺼짐').
- [ ] 기존 CSV 업로드 카드·표는 그대로. 새 카드는 업로드 카드 옆/아래 추가만(기존 셀렉터 불변).
- [ ] i18n ko+zhTw 전 키.

## Task 4: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] build + 서버 테스트 전체 + e2e 6종(무수정)
- [ ] 브라우저: 미설정 상태 카드(현재 dev — disabled+안내) 확인, PERF_SOURCE_PROVIDER=mock으로 서버 띄워 수동 동기화 1회 → 임포트 이력·미매칭 보고 확인
- [ ] 커밋

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

# 사이트 전체 이중 언어화 계획 (UI 전역 + 광고 분석 · 미디어 인사이트 · 브랜드)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법.

**Goal (사용자 요구, 원문 의도):** "이 사이트 자체가 양쪽 언어로 잘 보였으면 좋겠다. 사용자가 한국인일 수도 대만인일 수도 있다." — 즉 ① 사이트 UI 전체(내비·버튼·라벨·도움말·툴팁·상태 라벨)가 한국어/번체중문 전환 가능해야 하고, ② AI 생성물(분석·인사이트)도 양언어 병행 생성, ③ 사람이 쓴 브랜드 정보는 AI 번역 버튼으로 번체중문본 생성. 워크플로: 과정 작업은 한국인, 최종 검수·게재는 대만인.

**기준 구현:** 브리프 이중 언어 커밋 `fa87098` (generate-brief@v2, zhTwFields Json, zhTwJson 노출, 토글). 이 패턴을 확장하되 **언어 선택은 전역 하나로 통일**한다.

**환경 제약 (반드시 준수):**
- git 명령 금지 (커밋은 Claude). prisma migrate dev 실행 불가 → 마이그레이션 폴더+SQL 수동 작성(단순 ALTER ADD COLUMN). 적용은 Claude.
- AI 라이브 호출 0. 테스트는 mock. 라이브 검증은 Claude.
- 프롬프트에 JSON 필드명 명시. promptVersion bump 필수.
- BullMQ jobId 구분자 `--`, 신규 잡은 JobRecordService.enqueueOrRetry.
- **E2E 계약 (가장 중요): 기본 언어는 한국어다. localStorage가 비어 있으면 반드시 ko로 렌더링 → 기존 e2e 스펙은 무수정 통과해야 한다. 한국어 UI 문자열·mock 한국어 출력([MOCK ...])·배지 영문 enum은 글자 하나도 바꾸지 말 것.** zh 문자열은 추가만. e2e 스펙 수정 금지.
- 새 Resolver 클래스 생성 시 generate-schema.ts 등록.
- 외부 i18n 라이브러리 추가 금지 — 아래 자체 경량 구조 사용 (의존성 최소 원칙).

---

## Task 1: 전역 언어 인프라 (웹)

**Files:** `apps/web/src/i18n/lang-context.tsx`(신규), `apps/web/src/i18n/messages.ts`(신규), `apps/web/src/components/AppShell.tsx`, `apps/web/src/main.tsx`(Provider 장착), `apps/web/src/components/components.css`

- [ ] `LangContext` + `LangProvider`: `lang: 'ko' | 'zhTw'`, `setLang`, localStorage `'babeloop-lang'` 저장(초기값: 해당 키 → 구키 `'babeloop-brief-lang'` → `'ko'`).
- [ ] `useT()` 훅: `t(key)` — messages.ts의 중첩 사전에서 현재 언어 문자열 반환. **키가 zh 사전에 없으면 ko로 폴백** (누락이 화면 깨짐으로 이어지지 않게).
- [ ] `messages.ts` 구조: `export const messages = { ko: {...}, zhTw: {...} }` — 페이지·컴포넌트별 네임스페이스(nav, common, ads, media, briefs, brands, review, experiments, performance, guides, hints, status). ko 값은 기존 화면 문자열과 **정확히 동일**해야 한다.
- [ ] AppShell 상단 내비(계정 영역 옆)에 전역 언어 스위치: 기존 `.lang-toggle` 스타일 재사용, 한국어 / 繁體中文.
- [ ] 내비 링크·툴팁(data-hint)·로그아웃 등 AppShell 문자열부터 t()로 교체.

## Task 2: UI 문자열 전면 추출·번역 (웹)

**Files:** `apps/web/src/pages/*.tsx` 전체, `apps/web/src/components/*.tsx`, `apps/web/src/lib/status-labels.ts`, `apps/web/src/lib/page-guides.tsx`

- [ ] 모든 페이지·컴포넌트의 하드코딩 한국어 문자열을 t() 키로 교체: 페이지 제목·설명, 폼 라벨, 버튼 텍스트, data-hint 툴팁, 빈 상태 문구, 진행 순서 안내(action-flow-hint), 모달 제목·안내, 확인창(window.confirm) 메시지, 에러 안내 문구(서버가 주는 메시지는 제외 — 그대로 표시).
- [ ] `STATUS_LABELS`: `{ ko, zhTw, tone }`로 확장, StatusBadge가 현재 언어 라벨 + 영문 enum 병기(영문 enum 병기는 불변).
- [ ] `page-guides.tsx`(HelpPanel 내용): role·steps·buttons·terms 전부 양언어화 — 구조를 `{ ko: PageGuide, zhTw: PageGuide }` 또는 t() 기반으로.
- [ ] 번체중문 번역 원칙: 대만 용어(影片·介面·點擊 등), 대륙 용어 금지. UI 용어 일관성 유지(광고=廣告, 브리프=簡報, 검토=審核, 실험=實驗, 성과=成效, 미디어=媒體, 브랜드=品牌, 추출=擷取, 분석=分析, 생성=生成, 내보내기=匯出). 번역은 초안 품질로 두고 코드 주석에 "대만 검수자 감수 예정" 명시.
- [ ] 날짜 포맷: 현재 `Intl.DateTimeFormat('ko-KR')` → 언어에 따라 'zh-TW' 로케일 사용 (공통 헬퍼로 추출).
- [ ] **검증 기준: 언어를 바꾸지 않은 상태(localStorage 없음)에서 모든 화면이 기존과 문자열 단위로 동일할 것.**

## Task 3: 광고 분석 이중 언어 (서버 + 웹)

**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_analysis_insight_zh_tw/migration.sql`(Task 4와 공용 1개), 분석 시스템 프롬프트 파일(creative-analysis 프로세서가 쓰는 것), 해당 zod 스키마, `apps/server/src/modules/source-ad/*`(모델·매핑), `apps/web/src/pages/SourceAdDetailPage.tsx`

- [ ] `CreativeAnalysis.zhTwFields Json?` — { summary, hookType, targetAudience[], emotionalTriggers[], genres[] }.
- [ ] 분석 프롬프트 v2: 최상위=한국어(기존 그대로), `zhTw` 객체 병행(JSON 구조 명시). zod에 zhTw 필수 추가. promptVersion `analyze-creative@v2`.
- [ ] mock 분석 출력에 zhTw 추가 (`[MOCK 繁中] ...`), 기존 한국어 값 불변.
- [ ] 프로세서 저장 + GraphQL 분석 모델 `zhTwJson` nullable + 매핑.
- [ ] SourceAdDetailPage 「최신 분석 결과」: 전역 언어가 zhTw이고 zhTwJson 있으면 번체중문 표시, 없으면 "번체중문 병행본이 없습니다 (재분석 시 생성)" 안내 후 원문. 원본 데이터(제목·문구·추출 텍스트)는 언어와 무관하게 원문 유지.
- [ ] 유닛 테스트: zod zhTw 파싱 1건.

## Task 4: 미디어 인사이트 이중 언어 (서버 + 웹)

**Files:** `apps/server/src/modules/media/media-analysis.schema.ts`, 인사이트 프롬프트 위치, `apps/server/src/queues/creative-analysis.processor.ts`(ANALYZE_MEDIA), `apps/server/src/modules/media/media.models.ts`·`media.service.ts`, `apps/web/src/pages/MediaDetailPage.tsx`

- [ ] `MediaInsight.zhTwFields Json?` (같은 5필드). 프롬프트 v2 + zod + promptVersion `analyze-media@v2` + mock zh 추가(기존 `[MOCK 미디어 인사이트]` 불변).
- [ ] MediaInsightModel `zhTwJson` + 매핑. MediaDetailPage 인사이트 카드: 전역 언어 따라 전환 + 없으면 안내.
- [ ] 유닛 테스트: 스키마 파싱 1건.

## Task 5: 브랜드 번역 (서버 + 웹)

**Files:** `prisma/schema.prisma` + 별도 마이그레이션, `apps/server/src/modules/brand/*`, `apps/server/src/modules/generation/generation.prompts.ts`(번역 프롬프트) 또는 brand 모듈 내 프롬프트, 잡: CREATIVE_GENERATION_QUEUE에 `JOB_TYPES.TRANSLATE_BRAND`, `apps/web/src/pages/BrandDetailPage.tsx`

- [ ] `Brand.zhTw Json?`({ description, features:[{name,description}], guidelines:[{title,content}] }) + `zhTwTranslatedAt DateTime?`.
- [ ] mutation `translateBrandZhTw(brandId: ID!) → JobModel`: jobId `translate-brand--{id}`, enqueueOrRetry. 프로세서: 브랜드 전체를 번역 프롬프트(JSON 구조 명시, 대만 용어) 1회 호출 → zhTw + zhTwTranslatedAt 저장. AiExecutionLog.record. promptVersion `translate-brand@v1`. mock 케이스 추가.
- [ ] BrandModel `zhTwJson`·`zhTwTranslatedAt` + 매핑 (brand 쿼리·brands 목록 매핑 확인).
- [ ] BrandDetailPage: 「번체중문 번역 생성」 버튼(hint: 비용 ~1센트, 잡 폴링·완료 refetch). 전역 언어 zhTw면 소개·기능·가이드라인을 번역본으로 표시(없으면 안내). `updatedAt > zhTwTranslatedAt`이면 "원문이 수정되었습니다 — 번역을 다시 생성하세요" 배너 (updatedAt 필드가 GraphQL에 없으면 추가).
- [ ] 유닛 테스트: 번역 저장 매핑 1건 (mock).

## Task 6: 브리프 토글 통합

- [ ] BriefDetailPage의 로컬 토글 제거 → 전역 언어 사용 (zhTw 없을 때 안내 폴백 유지). 구 localStorage 키는 Task 1 초기값 폴백으로만 사용.

## Task 7: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용, build + 서버 테스트 전체 + **e2e 6종 무수정 통과 (합격선)**
- [ ] 브라우저: 전역 스위치로 全화면 繁體中文 순회 스크린샷(내비·광고·미디어·브리프·브랜드·검토·실험·성과), ko 복귀 확인
- [ ] 라이브(~3센트): 광고 분석 1건 재실행 + 미디어 인사이트 1건 재실행 + 브랜드 번역 1건 → zh 표시 확인
- [ ] 커밋

**보고에 포함:** 작성·수정 파일 목록, 건너뛴 명령, 계획과 다른 부분, 추출한 문자열 키 개수, 미번역(ko 폴백) 잔여 여부.

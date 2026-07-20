# BabeLoop UI 전면 개편 구현 계획 (Airbnb 디자인 시스템)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기능 검증용 뼈대 UI(무CSS·무설명·453행 벽)를 사람이 이해하고 쓸 수 있는 도구로 개편. 디자인은 `docs/DESIGN-airbnb.md`의 토큰·컴포넌트 정의를 **그대로** 따른다 — 새 색·새 크기를 발명하지 말 것.

**Architecture 불변:** React + Vite 정적 빌드 → NestJS 서빙 구조 그대로. CSS는 일반 CSS 파일 + CSS 변수 (Tailwind 등 새 의존성 도입 금지 — 스택은 스펙 §9.2 고정).

**절대 제약 — E2E 접근성 계약 보존:** e2e/slice0~5.spec.ts가 의존하는 접근 가능한 이름을 바꾸면 안 된다:
- 모든 label 텍스트(이메일, 비밀번호, 제목, 광고 문구, 포커스, 실험 코드, 실험 이름, 성과 CSV, 실험, zh-TW 수정, Sensor Tower CSV, 소스 URL)
- 모든 버튼 이름(로그인, 로그아웃, 광고 등록, 브리프 생성, 문구 변형 3개 생성, 정책 검사, 검토 요청, 수정 저장, 현지화 승인, 최종 승인, 실험 생성, 실험에 추가, 내보내기, 성과 업로드, 이 성과로 브리프 생성, 업로드, 미디어 텍스트 추출, 광고 분석, 재다운로드, 유사 광고)
- 내비 링크 이름(브랜드, 미디어, 광고, 브리프, 검토, 실험, 성과) — 홈 링크는 새로 추가
- 페이지 h1(exact 매칭됨: 광고, 브리프, 성과, 검토, 실험, 미디어, 브랜드), 카드 컨테이너는 `<li>` 유지, 상태 배지에 **영문 enum 원문이 반드시 포함** (예: 배지 안에 `분석 완료 ANALYZED` 또는 `title` 속성이 아닌 **텍스트로** ANALYZED 포함 — E2E가 getByText('ANALYZED')로 찾는다. 형식: 한국어 라벨과 영문을 함께 렌더 `<span class="badge">분석 완료<span class="badge-code">ANALYZED</span></span>`)
- 완료 후 `pnpm e2e` 6종 전부 통과가 이 계획의 합격선이다.

## 누적 환경 제약

이전 계획서 전부 동일 적용 (특히: wait 루프 금지, git 금지, 실제 AI 호출 금지 — **이 계획은 AI 호출이 전혀 없어야 정상**).

---

## Task 1: 디자인 토큰 + 기반 스타일

**Files:**
- Create: `apps/web/src/styles/tokens.css`, `apps/web/src/styles/base.css`
- Modify: `apps/web/src/main.tsx` (import 순서: tokens → base), `apps/web/package.json` (+`pretendard`)

- [ ] `pnpm --filter @babeloop/web add pretendard` (불가 시 package.json에 `"pretendard": "^1.3.9"` 직접 추가)
- [ ] `tokens.css` — DESIGN-airbnb.md의 값을 1:1로 CSS 변수화:

```css
:root {
  /* colors — DESIGN-airbnb.md 그대로 */
  --primary: #ff385c;
  --primary-active: #e00b41;
  --primary-disabled: #ffd1da;
  --error-text: #c13515;
  --ink: #222222;
  --body: #3f3f3f;
  --muted: #6a6a6a;
  --muted-soft: #929292;
  --hairline: #dddddd;
  --hairline-soft: #ebebeb;
  --border-strong: #c1c1c1;
  --canvas: #ffffff;
  --surface-soft: #f7f7f7;
  --surface-strong: #f2f2f2;
  --on-primary: #ffffff;
  /* 상태 배지 전용 시맨틱 (내부 도구 필요분 — 원 시스템의 restraint 유지: 연한 배경 + 진한 글자) */
  --status-positive-bg: #e8f6ea;  --status-positive-fg: #1d7a2c;
  --status-progress-bg: #fff0f3;  --status-progress-fg: var(--primary-active);
  --status-neutral-bg: var(--surface-strong); --status-neutral-fg: var(--muted);
  --status-warn-bg: #fdf2ee;      --status-warn-fg: var(--error-text);

  /* rounded */
  --r-xs: 4px; --r-sm: 8px; --r-md: 14px; --r-lg: 20px; --r-xl: 32px; --r-full: 9999px;

  /* spacing */
  --sp-xxs: 2px; --sp-xs: 4px; --sp-sm: 8px; --sp-md: 12px; --sp-base: 16px;
  --sp-lg: 24px; --sp-xl: 32px; --sp-xxl: 48px; --sp-section: 64px;

  /* 단일 그림자 티어 (시스템 유일의 elevation) */
  --shadow-float: rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0;

  --font: 'Pretendard Variable', Pretendard, -apple-system, system-ui, Roboto, 'Helvetica Neue', sans-serif;
}
```

- [ ] `base.css` — 리셋 + 기본 타이포:

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font); color: var(--ink); background: var(--canvas);
       font-size: 16px; line-height: 1.5; }
h1 { font-size: 28px; font-weight: 700; line-height: 1.43; }
h2 { font-size: 20px; font-weight: 600; line-height: 1.2; letter-spacing: -0.18px; }
button { font-family: inherit; cursor: pointer; }
input, textarea, select { font-family: inherit; font-size: 16px; }
a { color: inherit; }
ul, ol { list-style: none; }
```

`main.tsx`에 `import 'pretendard/dist/web/variable/pretendardvariable.css'; import './styles/tokens.css'; import './styles/base.css';`

- [ ] 빌드 확인 → Commit (Codex 건너뜀): `feat: 디자인 토큰과 기반 스타일 (Airbnb 시스템 1:1)`

---

## Task 2: 공용 컴포넌트

**Files:**
- Create: `apps/web/src/components/` — `AppShell.tsx`(top-nav+레이아웃), `PageHeader.tsx`, `StatusBadge.tsx`, `Button.tsx`, `Card.tsx`, `EmptyState.tsx`, `FormField.tsx`, `components.css`
- Modify: `apps/web/src/App.tsx` (AppShell 적용)

핵심 사양 (DESIGN-airbnb.md의 컴포넌트 정의 준수):

- **AppShell** — `top-nav`: 흰 배경, 높이 80px, 하단 1px hairline. 좌측 워드마크 **BabeLoop** (Rausch 색, 20px/700). 중앙 탭 7개(홈·브랜드·미디어·광고·브리프·검토·실험·성과): `nav-link` 타이포(16px/600), 활성 탭은 ink + 하단 2px ink 언더라인, 비활성은 muted. 우측: 로그인 사용자 표시(이름·역할 한국어) + "로그아웃" `button-secondary` 소형. 본문은 max-width 1280px 중앙, 좌우 `--sp-lg` 패딩, 상단 `--sp-xl`.
- **PageHeader** — h1(기존 텍스트 유지) + 아래 `body-sm` muted 한 줄 설명 + (옵션) 다음 단계 힌트. 하단 `--sp-lg` 마진.
- **StatusBadge** — `<span>` pill(`--r-full`, 11px/600, padding 4px 10px). **한국어 라벨 + 영문 enum을 나란히 렌더** (영문은 10px muted — E2E getByText 계약). 상태→라벨·색 매핑은 `apps/web/src/lib/status-labels.ts`로 분리:

```typescript
export const STATUS_LABELS: Record<string, { ko: string; tone: 'positive' | 'progress' | 'neutral' | 'warn' }> = {
  REGISTERED: { ko: '등록됨', tone: 'neutral' },
  ANALYZING: { ko: '분석 중', tone: 'progress' },
  ANALYZED: { ko: '분석 완료', tone: 'positive' },
  FAILED: { ko: '실패', tone: 'warn' },
  PENDING: { ko: '업로드 대기', tone: 'neutral' },
  UPLOADED: { ko: '업로드됨', tone: 'neutral' },
  PROCESSING: { ko: '처리 중', tone: 'progress' },
  READY: { ko: '완료', tone: 'positive' },
  QUEUED: { ko: '대기 중', tone: 'neutral' },
  RUNNING: { ko: '실행 중', tone: 'progress' },
  SUCCEEDED: { ko: '성공', tone: 'positive' },
  DRAFT: { ko: '초안', tone: 'neutral' },
  POLICY_CHECKED: { ko: '정책 검사 완료', tone: 'progress' },
  IN_REVIEW: { ko: '검토 중', tone: 'progress' },
  LOCALIZATION_APPROVED: { ko: '현지화 승인', tone: 'progress' },
  APPROVED: { ko: '승인됨', tone: 'positive' },
  EXPORTED: { ko: '내보냄', tone: 'positive' },
  REVISION_REQUESTED: { ko: '수정 요청됨', tone: 'warn' },
  REJECTED: { ko: '거절됨', tone: 'warn' },
};
```

- **Button** — variant: `primary`(Rausch 채움, 8px r, 48px 높이 — 페이지당 주 액션 1개만), `secondary`(흰 배경 + 1px ink 아웃라인), `text`(밑줄 hover). 소형(`sm`, 36px)도. 기존 `<button>`을 전부 이 컴포넌트로 교체하되 **텍스트는 그대로**.
- **Card** — 흰 배경, `--r-md`, 1px hairline, hover 시 `--shadow-float`. 내부 패딩 `--sp-lg`.
- **FormField** — label 위(caption muted), input 아래(8px r, 1px hairline, 높이 48px, focus 시 2px ink — glow 금지). **label은 `<label>` 연결 유지** (E2E getByLabel).
- **EmptyState** — 아이콘 없이: title-md + body-sm muted + (옵션) 행동 버튼.

- [ ] Commit: `feat: 공용 UI 컴포넌트 (AppShell·배지·버튼·카드·폼)`

---

## Task 3: 홈 대시보드 (신규 `/`)

**Files:**
- Create: `apps/web/src/pages/HomePage.tsx`
- Modify: `App.tsx` (라우트 `/` = HomePage, 로그인 시 리다이렉트 기본을 `/`로)

- [ ] 루프 6단계를 카드 그리드(2×3, 16px 간격)로: ① 수집(광고 — CSV 임포트·수동 등록) ② 분석(광고 — 텍스트 추출·AI 분석) ③ 생성(브리프 — RAG 브리프·변형·zh-TW) ④ 검토(검토 — 정책 검사·검수·승인) ⑤ 내보내기(실험 — 추적코드 패키지) ⑥ 성과(성과 — CSV 업로드·퍼널·환류). 각 카드: 단계 번호(Rausch, micro-label), 제목(title-md), 2줄 설명(body-sm muted), 해당 탭 이동 링크. 상단 PageHeader: "BabeLoop — 경쟁 광고를 배우고, 우리 광고를 만들고, 성과로 되먹입니다."
- [ ] slice0 E2E는 로그인 후 `/brands`로 안 가고 `/`로 갈 수 있음 — **로그인 후 랜딩이 바뀌면 e2e/slice0이 깨지는지 확인**: slice0은 로그인 클릭 후 곧장 `브랜드` heading을 기다림 → 랜딩을 `/`로 바꾸면 깨진다. 해결: 로그인 후 랜딩은 기존대로 `/brands` 유지, 홈은 내비 "홈" 탭으로 진입 (E2E 계약 보존이 우선).
- [ ] Commit: `feat: 홈 대시보드 — 워크플로 6단계 안내`

---

## Task 4: 광고 페이지 재설계 (백엔드 포함 — 가장 큰 태스크)

**Files (서버):**
- Modify: `apps/server/src/modules/source-ad/source-ad.inputs.ts`(+`SourceAdFilterInput`), `source-ad.models.ts`(+`SourceAdPage`, `mediaAsset.thumbnailUrl`), `source-ad.service.ts`(페이지네이션·필터·썸네일), `source-ad.resolver.ts`

**Files (웹):**
- Rewrite: `apps/web/src/pages/SourceAdsPage.tsx` (+`source-ads.css` 또는 components.css 확장)

서버 사양:
- `sourceAdsPage(input: { offset: Int = 0, limit: Int = 24, status?: SourceAdStatus, kind?: MediaAssetKind, competitorId?: ID, search?: String })` → `SourceAdPage { items: [SourceAdModel], totalCount: Int }`. search는 title·adText ILIKE. **기존 `sourceAds` 쿼리는 유지** (E2E·기존 화면 호환). offset 페이지네이션 — 내부 도구 규모(수백 건)에서 cursor는 YAGNI (스펙 §11 cursor 원칙에서 의도적 이탈, 노트).
- `MediaAssetModel`에 `thumbnailUrl: String` nullable — kind IMAGE이고 status READY/UPLOADED면 `storage.presignGet(storageKey)` (15분 만료), VIDEO는 null (썸네일은 FFmpeg 작업 후). 계산은 service 매핑 시 (`Promise.all` — limit 24라 presign 24회, 문제 없음).

웹 사양 (property-card 문법 적용):
- 상단: PageHeader("경쟁사 광고를 수집하고 분석합니다...") + 접이식 "광고 수동 등록" 섹션(Card, 기본 접힘 — 453건 시대에 폼이 첫 화면을 차지하면 안 됨. `<details>` 사용, summary "광고 수동 등록") + CSV 임포트는 우측 상단 secondary 버튼 스타일 파일 인풋.
- 필터 바: 상태 select, 종류 select(이미지/영상/전체), 검색 input(디바운스 300ms), 총 건수 표시("453건 중 1–24").
- 카드 그리드: 4열(1128px+)/2열/1열 반응형, 16px 간격. 카드(`<li>`): 1:1 썸네일(`--r-md` 클리핑, 이미지 없으면 surface-soft 배경 + 종류 라벨), 상단 좌측 StatusBadge 플로팅, 아래 메타 3줄 — 광고주/제목(title-md, 1줄 말줄임), 네트워크·국가(body-sm muted, 1줄), 활성 기간(First~Last Seen, body-sm muted). 분석 완료 시 훅 유형 한 줄. 액션: 카드 하단에 소형 버튼들(기존 텍스트 유지 — 미디어 텍스트 추출/광고 분석/재다운로드/유사 광고), 조건 노출 로직 기존 그대로.
- 유사 광고 결과는 카드 아래 인라인 목록 유지.
- 페이지네이션: 하단 "이전/다음" + 페이지 표시.
- **E2E 주의**: slice2·slice4 E2E는 광고 등록 폼과 목록을 쓴다 — `<details>`가 닫혀 있으면 getByLabel('제목')이 hidden으로 실패할 수 있음 → **`<details open>`이 아니라, E2E 호환을 위해 폼 label들은 details 안에 있어도 Playwright fill이 동작하는지가 관건. 안전하게: 수동 등록 섹션은 접지 말고 우측에 좁게 배치하거나, `<details>`를 쓰되 e2e에서 summary 클릭을 추가하는 대신 — 계약 보존이 우선이므로 접지 않는 2열 레이아웃(좌: 필터+그리드 본문 / 상단 우측: 등록 Card 축소 배치)으로. 판단 기준: e2e 파일 수정 없이 통과할 것.**

- [ ] 전체 테스트 + Commit: `feat: 광고 페이지 재설계 — 썸네일·필터·페이지네이션`

---

## Task 5: 나머지 페이지 개편 (로그인·브랜드·미디어·브리프·검토·실험·성과)

**Files:** 각 페이지 tsx 수정 (+ 필요한 css)

공통 규칙: PageHeader(제목 유지 + 설명 추가), 폼은 FormField, 목록은 Card `<li>`, 상태는 StatusBadge, 버튼 텍스트 불변. 페이지별 설명 문구:

- **로그인**: 중앙 420px Card, 워드마크 + "BabeChat 마케팅 자동화 내부 도구". 데모 계정 안내는 넣지 않는다.
- **브랜드**: "광고 브리프 생성에 쓰이는 BabeChat 브랜드 정보입니다."
- **미디어**: "이미지·영상을 업로드하면 텍스트 추출(OCR·전사)을 거쳐 분석에 쓰입니다." — 업로드 영역을 Card로, 자산 목록에 썸네일 없이 파일명+StatusBadge+추출 텍스트 접기(`<details>` — E2E는 getByText('[MOCK OCR]')를 쓰므로 **추출 텍스트는 details가 아니라 항상 노출** 유지).
- **브리프**: "경쟁 광고 패턴 + 브랜드 정보로 광고 브리프와 문구를 만듭니다. 흐름: 브리프 생성 → 변형 생성 → 검토 탭에서 승인." 브리프 카드: 제목(display-sm) + 필드 그리드(욕구/훅/CTA — caption 라벨 + body-sm 값) + 근거는 muted 2줄. 변형 목록: 번호 배지 + 원문 + zh-TW(연한 surface-soft 박스, "번체중문 초안" caption 라벨).
- **검토**: "생성된 문구를 정책 검사 → 검수 → 승인하는 곳입니다. 자기가 만든 문구는 자기가 승인할 수 없습니다." 카드에 상태별 액션 버튼 그룹(기존 로직·텍스트 유지), zh-TW 수정 textarea는 FormField. 미성년자 플래그는 warn 배지 + 사유 표시.
- **실험**: "승인된 문구를 실험에 배정하면 추적코드(BL-…)가 발급되고, 내보내기로 광고 집행용 파일을 받습니다." 실험 카드: 코드(micro-label Rausch) + 이름, variants 테이블(변형코드/추적코드/문구 요약), 내보내기 결과 파일 링크 목록.
- **성과**: "집행 결과 CSV를 올리면 추적코드로 연결되어 소재별 퍼널이 표시됩니다." 퍼널 테이블: hairline 행 구분, 숫자 우측 정렬, **"소재 단위 없음" 배지는 warn 톤으로 강조** (설계 §7 정직 표시), CSV 형식 안내는 `<details>` 접기.

- [ ] 빌드 + Commit: `feat: 전 페이지 디자인 시스템 적용과 안내 문구`

---

## Task 6: dev DB 청소 스크립트

**Files:**
- Create: `prisma/cleanup-dev.ts`, 루트 package.json script `"cleanup:dev": "tsx prisma/cleanup-dev.ts"`

- [ ] 삭제 대상 (E2E·테스트 잔여물 — 패턴은 E2E 시드 명명 규칙과 일치, 재실행 가능):
  - `creative_briefs` WHERE `provider = 'mock'` (연쇄: creatives → localizations)
  - `source_ads` WHERE (title ~ `'^(RAG-|A-\d{13}|B-\d{13}|C-\d{13}|ad-[a-z0-9]{6}|훅 테스트)'` OR `adText` LIKE `'%완전 상동%'` OR adText ~ `'\d{13}'`) AND provider = 'manual' AND NOT title = '실검증-경쟁광고'
  - `brands` WHERE name ~ `'^(BabeChat-\d{13}|X$)'`
  - `experiments` WHERE name LIKE 'E2E 실험%' (연쇄: variants·export_packages 정리 — export_packages는 FK 없으니 experimentId로 삭제)
  - `media_assets` WHERE `originalFilename` IN ('sample.png') AND 연결된 source_ads 없음
  - performance rows WHERE trackingCode가 삭제된 variants에 속함
- [ ] 실행 전 대상 건수 출력 → `--yes` 플래그 없으면 dry-run만. 실행 후 남은 주요 테이블 카운트 출력.
- [ ] Commit: `chore: dev DB 테스트 잔여물 청소 스크립트 (dry-run 기본)`

---

## Task 7: 검증 (Claude 수행 항목 포함)

- [ ] `pnpm --filter @babeloop/server test` 전체 PASS (UI 작업이 서버 테스트를 깨지 않았는지 — Task 4 서버 변경 포함)
- [ ] `pnpm build` 성공, `pnpm e2e` **6종 전부 PASS — 이 계획의 합격선**
- [ ] (Claude) `pnpm cleanup:dev --yes` 실행 후 브라우저 순회: 전 페이지 스크린샷 육안 확인 — 디자인 토큰 적용·설명 문구·배지·광고 그리드·필터 동작
- [ ] (Claude) 사용자에게 스크린샷 첨부 보고

# 목록→상세 패턴 확산 계획 (광고·브리프·검토·실험)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 승인한 브랜드 탭의 3단계 구조(간결한 목록 → 읽기 전용 상세 → 필요 시 액션)를 광고·브리프·검토·실험에 적용. 목록 카드는 요약만, 긴 내용과 액션 버튼들은 상세 페이지로.

**기준 구현:** `apps/web/src/pages/BrandsPage.tsx` + `BrandDetailPage.tsx` (방금 완성 — 목록 카드·back-link·PageHeader actions·읽기 전용 섹션 패턴을 그대로 따를 것)

**E2E 정책 변경 (이번 계획 한정):** 화면 구조가 의도적으로 바뀌므로 **e2e/slice2~5.spec.ts의 내비게이션 단계를 함께 갱신한다.** 단: 모든 label·버튼 텍스트·배지 영문 enum은 그대로 유지 — 바뀌는 것은 "어느 페이지에서 누르는가"뿐. 아래 태스크별로 새 흐름을 명시한다. slice0·slice1은 손대지 않는다. 합격선: `pnpm e2e` 6종 통과.

**공통 규칙:** 라우트는 `/ads/:id`·`/briefs/:id`·`/review/:id`·`/experiments/:id` (App.tsx에 로그인 가드 포함 추가). 상세 페이지 상단은 `← {목록명} 목록` back-link (BrandDetail과 동일 클래스). 목록 카드에 "상세 보기 →" CTA. 상세 데이터는 각 단건 쿼리 사용 (sourceAd(id)·creativeBrief(id)·실험은 experiments에서 find 또는 단건 쿼리 추가 — 서버에 experiment(id)·creative(id) 단건 쿼리가 없으면 추가한다). 잡 폴링·상시 폴링(3초)은 상세 페이지에서도 동일 근거로 유지.

---

## Task 1: 광고 (/ads → /ads/:id)

- **목록 카드 간결화**: 썸네일(클릭 시 상세로 이동 — 인라인 뷰어 제거), 상태 배지, 제목, 광고주·기간 한 줄, "상세 보기 →". **버튼 4개(미디어 텍스트 추출·광고 분석·재다운로드·유사 광고)는 카드에서 제거**하고 상세로 이동. 필터·검색·페이지네이션·좌측 수동 등록 폼·CSV 임포트는 그대로.
- **상세 `/ads/:id`** (`SourceAdDetailPage.tsx` 신규): 미디어 뷰어(이미지 원본/영상 플레이어 — **URL은 마운트 시 고정**, 폴링 재발급 금지) + 원본 다운로드, 메타(광고주·네트워크·국가·기간·출처·신뢰도), 추출 텍스트(OCR·전사 전문), 최신 분석 결과(요약·훅·타깃·감정·장르), "이 광고를 참조한 브리프" 링크 목록, 액션 버튼 4개(기존 텍스트·hint 그대로) + 유사 광고 결과 인라인. 서버: `sourceAd(id)`에 mediaUrl·referencingBriefs 포함되는지 확인, 빠져 있으면 findById에 매핑 추가.
- **e2e/slice2 갱신**: 등록 2건 → 목록 카드에서 ANALYZED 배지 대기(유지) → **A 카드의 "상세 보기 →" 클릭 → 상세에서 "유사 광고" 클릭 → B 제목 표시 확인**. (B 확인은 상세 내 결과 목록에서)
- **e2e/slice4·5의 광고 등록 단계**: 폼 위치 불변이므로 수정 불필요 (확인만).

## Task 2: 브리프 (/briefs → /briefs/:id)

- **목록**: 생성 폼(제목·브랜드·포커스)은 상단 유지(핵심 진입 액션). 브리프 카드는 요약만 — 제목, 훅·CTA 한 줄, 변형 수("변형 3개"), 생성일, "상세 보기 →". 필드 그리드·변형 목록·zh-TW는 목록에서 제거.
- **상세 `/briefs/:id`** (`BriefDetailPage.tsx` 신규): 브리프 전 필드(욕구·훅·메시지 앵글·비주얼 형식·CTA·근거), 참조한 경쟁 광고 링크(→ /ads/:id), "문구 변형 3개 생성" 버튼(잡 폴링), 변형 목록(원문 + zh-TW 초안 + 상태 배지), 각 변형에서 검토 상세로 가는 링크("검토에서 보기 →" — /review/:creativeId).
- **e2e/slice3 갱신**: 브리프 생성 → 목록에서 해당 카드 확인(스탬프 매칭) → **카드 클릭 → 상세에서 "문구 변형 3개 생성" → [MOCK 문구 1]·[MOCK 문구 3]·[MOCK zh-TW] 확인** (전부 상세 페이지 내).

## Task 3: 검토 (/review → /review/:id)

- **목록**: 문구 카드 요약만 — 상태 배지, 원문 첫 60자, 브리프 제목, revision, 미성년자 플래그 표시(⚠), "상세 보기 →". 액션 버튼·textarea 전부 제거.
- **상세 `/review/:id`** (`ReviewDetailPage.tsx` 신규): 원문 전문, zh-TW 최신본, 정책 검사 결과 목록(policy_checks), 검토 이벤트 이력, 상태별 액션 버튼 전부(기존 텍스트·로직 그대로: 정책 검사→검토 요청→zh-TW 수정·수정 저장→현지화 승인→최종 승인→수정 요청·거절·미성년 해제·실험 선택+실험에 추가). 서버: `creative(id)` 단건 쿼리 없으면 review 모듈에 추가 (creatives 목록 쿼리와 같은 include).
- **e2e/slice4 갱신**: 검토 목록 → **[MOCK 문구 1] 카드(브리프 제목 tag 매칭 유지) 클릭 → 상세에서 정책 검사 → POLICY_CHECKED 배지 → 검토 요청** → 로그아웃/검수자 로그인 → **다시 해당 상세 진입(목록에서 클릭) → zh-TW 수정·수정 저장·현지화 승인·최종 승인 → 실험 선택+실험에 추가 → BL-코드 표시**. slice5도 동일 구간 갱신.
- 주의: 상세 재진입 시 목록에서 같은 카드를 다시 찾는 셀렉터(브리프 제목 tag 포함)를 유지할 것.

## Task 4: 실험 (/experiments → /experiments/:id)

- **목록**: 실험 생성 폼은 버튼("새 실험 생성")으로 열림 (브랜드 패턴). 실험 카드 요약 — 코드(단계색 micro-label)·이름·변형 수·최근 내보내기 여부, "상세 보기 →".
- **상세 `/experiments/:id`** (`ExperimentDetailPage.tsx` 신규): variants 테이블(변형코드·추적코드·문구 요약·상태 — 문구 클릭 시 /review/:id), "내보내기" 버튼 + 결과 파일 링크 목록(manifest 포함), 내보내기 이력(export_packages). 서버: `experiment(id)` 단건 쿼리 없으면 추가.
- **e2e/slice4·5 갱신**: 실험 생성 시 **"새 실험 생성" 버튼 먼저 클릭** → 폼 입력(라벨 동일) → 생성 → **목록 카드 클릭 → 상세에서 내보내기 → 파일 링크(BL-….txt) 확인·다운로드 검증**(기존 request.get 로직 유지).

## Task 5: 검증

- [ ] `pnpm build` + 서버 테스트 전체 + **`pnpm e2e` 6종 통과 (합격선)**
- [ ] (Claude) 브라우저 순회: 4개 목록→상세 왕복, 영상 재생(광고 상세), 검토 액션 흐름 스크린샷

**주의사항:** ①상세 페이지들도 li/카드 구조 아님 — 자유. 단 배지의 영문 enum 병기는 유지 ②GraphQL 문서 추가 시 schema:emit 후 codegen (빌드 체인이 처리) ③이 작업에 AI 호출 0 ④신규 단건 쿼리는 generate-schema.ts 확인 불필요(기존 Resolver 확장이면) — 새 Resolver 클래스를 만들면 반드시 추가.

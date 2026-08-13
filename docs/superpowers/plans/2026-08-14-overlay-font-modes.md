# 문구 렌더 방식·폰트·색상 선택 — 서버 합성 미리보기 + AI 타이포 모드

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** 검토 이미지 생성 모달의 「이미지에 넣을 문구」를 확장한다. ① 렌더 방식 선택: **서버 합성**(기본, 글자 정확) vs **AI 타이포**(AI가 문구를 이미지 안에 직접 그림 — 스타일 자유, 한자 깨짐 위험 경고) ② **폰트 6종 미리보기 선택**(고딕·명조·둥근체·해서·손글씨·교과서체 — 입력한 실제 메인 문구로 각 폰트를 웹폰트로 미리 렌더, 선택한 폰트가 서버 합성에 그대로 적용) ③ **색상 선택**(흰/검/골드) ④ AI 모드에서는 선택 폰트·색상을 스타일 지시로 전달하거나 "참고 이미지와 비슷하게"/"이미지에 어울리게 자동" 선택 ⑤ 재생성 시 방식·폰트·색상 승계.

**전제 사실:**
- 폰트 6종 준비 완료(Claude가 다운로드·canvas 등록 스모크 확인, 커밋 예정), 모두 `apps/server/assets/fonts/`에 존재, 전부 OFL:
  | key | 파일 | 이름(ko/zh) | 느낌 |
  |---|---|---|---|
  | gothic | NotoSansTC-Bold.otf | 고딕/黑體 | 기본, 또렷 |
  | serif | NotoSerifTC-Bold.otf | 명조/明體 | 고급 세리프 |
  | rounded | jf-openhuninn-2.1.ttf | 둥근체/粉圓體 | 귀엽고 부드러움 |
  | kai | LXGWWenKaiTC-Medium.ttf | 해서/文楷 | 붓글씨·감성 |
  | yozai | Yozai-Medium.ttf | 손글씨/悠哉體 | 자유로운 필기 |
  | iansui | Iansui-Regular.ttf | 교과서체/芫荽 | 단정한 손글씨 |
- 합성은 @napi-rs/canvas (`text-overlay.ts`) — ffmpeg 아님. `GlobalFonts.registerFromPath(path, family)` 사용.
- 웹 미리보기는 **같은 폰트 파일**을 서버가 정적 서빙(`/fonts/*`)해서 @font-face로 로드 — 미리보기=합성 결과 일치. 내부 도구라 폰트 용량(합 ~54MB)은 허용하되 캐시 헤더를 길게 주고 font-display: swap으로 카드가 점진 로드되게.
- 서버 모드 promptVersion은 v4 유지(프롬프트 불변). AI 타이포 모드는 `generate-copy-images@v5`(타이포 지시 섹션이 v5의 정의).

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가(SQL 수동 작성). **AI 라이브 호출 0** — mock으로만.
- **Playwright e2e 6종 무수정 통과** — 신규 옵션 기본값(SERVER·gothic·white)에서 기존 흐름·mock 출력이 완전히 동일해야 한다.
- i18n ko+zhTw 전 키. 재생성 승계 패턴(규격·참고·문구와 동일)에 방식·폰트·색상 합류.

---

## Task 1: 폰트 레지스트리 + 합성 파라미터화 + 정적 서빙

**Files:** `apps/server/src/common/media/text-overlay.ts`(+spec), `apps/server/src/main.ts`(정적 서빙)

- [ ] 폰트 레지스트리: 위 표 6종을 `OVERLAY_FONTS: Record<key, { file, family }>`로 정의(family는 파일별 고유 명칭, 예: 'Noto Sans TC Overlay'). `ensureFont(font)`가 키별 1회 등록.
- [ ] 색상 레지스트리: `OVERLAY_COLORS = { white: { fill: '#FFFFFF', shadow: 'rgba(0,0,0,0.55)' }, black: { fill: '#1A1A1A', shadow: 'rgba(255,255,255,0.35)' }, gold: { fill: '#E8C87A', shadow: 'rgba(0,0,0,0.6)' } }`.
- [ ] `renderTextOverlay(buffer, layout, opts: { font: OverlayFont; color: OverlayColor })` — 폰트 family·fill·shadow 적용 (기본 gothic·white).
- [ ] `main.ts`: `/fonts` 경로로 `apps/server/assets/fonts` 정적 서빙 (immutable 캐시 1일+). 경로는 process.cwd() 기준(기존 폰트 경로 해석과 동일).
- [ ] 유닛: serif·gold 렌더가 gothic·white와 다른 바이트 1건, 잘못된 키 거부 1건.

## Task 2: 스키마·입력·프롬프트 분기·잡 흐름

**Files:** `prisma/schema.prisma` + `prisma/migrations/20260814150000_overlay_font_modes/migration.sql`(신규), `apps/server/src/modules/generation/brief.inputs.ts`·`brief.service.ts`·`generation.prompts.ts`·`brief.models.ts`, `apps/server/src/queues/creative-generation.processor.ts`, 관련 spec

- [ ] GeneratedImage에 `overlayMode String?`('SERVER'|'AI'), `overlayFont String?`, `overlayColor String?` 추가. SQL: `ALTER TABLE "generated_images" ADD COLUMN "overlayMode" TEXT, ADD COLUMN "overlayFont" TEXT, ADD COLUMN "overlayColor" TEXT;`
- [ ] `GenerateCreativeImagesInput`에 `overlayMode?: string`(기본 'SERVER'), `overlayFont?: string`(기본 'gothic'), `overlayColor?: string`(기본 'white'), `aiTypoStyle?: string`('selected'|'match_reference'|'auto', AI 모드만 유효). 검증: 허용값 외 BAD_USER_INPUT, overlay 옵션은 headline 있을 때만, match_reference는 references 있을 때만.
- [ ] **서버 모드**(기존): 프롬프트 불변(v4), 리사이즈 → 선택 폰트·색상으로 합성 → 클린+합성 저장.
- [ ] **AI 모드**: 합성 스킵(cleanStorageKey null). 프롬프트 분기 — 금지 조항에서 문구 금지를 해제하되 로고·워터마크·기타 글자 금지는 유지하고, 섹션 추가:
  `## 이미지 안에 그릴 문구 (반드시 이 글자들 그대로, 번체 한자 자획을 정확하게)\n메인: "{headline}"\n서브: "{subline}"(있을 때)\n타이포 스타일: {aiTypoStyle에 따라 — selected: '{폰트 이름} 계열({고딕/명조/둥근/해서/손글씨/교과서체}) 느낌, 색상 {색}' / match_reference: '참고 이미지의 타이포그래피와 비슷한 서체·배치' / auto: '이미지 분위기에 가장 어울리는 서체를 선택'}\n문구 외 다른 글자·로고·워터마크는 넣지 마라.`
  promptVersion `generate-copy-images@v5`.
- [ ] 저장 시 overlayMode·overlayFont·overlayColor 기록(AI 모드는 aiTypoStyle을 raw prompt로 추적 — 별도 컬럼 불필요). 검토 상세 images 모델에 세 필드 노출.
- [ ] 유닛: AI 모드가 합성을 건너뛰고 v5 프롬프트에 문구·스타일 섹션 포함 1건, 서버 모드 폰트·색상이 renderTextOverlay에 전달 1건, match_reference를 참고 없이 보내면 거부 1건.

## Task 3: 검토 UI — 방식 선택·폰트 미리보기·색상

**Files:** `apps/web/src/pages/ReviewDetailPage.tsx`, `review.css`, `apps/web/src/lib/image-size-presets.ts`(또는 신규 overlay-options 모듈), `apps/web/src/i18n/messages.ts`, `full-guide.ts`(한 줄)

- [ ] @font-face 6종(`/fonts/...`, font-display: swap)을 review.css에 선언.
- [ ] 「이미지에 넣을 문구」 섹션에 (headline 있을 때만 노출되는) 하위 옵션:
  - 방식 라디오: 「서버 합성 (글자 정확)」 기본 / 「AI가 그리기 (스타일 자유)」 — AI 선택 시 경고문 `AI가 그리는 한자는 획이 깨질 수 있습니다 — 결과를 검수하세요`.
  - **폰트 카드 6개**(2열 그리드, 가로 스크롤 아님): 각 카드에 입력 중인 메인 문구(비면 승인 zh-TW 첫 줄, 그것도 없으면 '戰場上的智慧女神')를 해당 웹폰트·선택 색상으로 렌더(어두운 배경 칩 위) + 폰트 이름 라벨(ko/zh). 클릭 선택(테두리 강조).
  - **색상 스와치 3개**(흰/검/골드) — 선택 시 폰트 카드 글자색도 갱신.
  - AI 모드일 때 스타일 라디오: 「선택한 폰트 느낌으로」 기본 / 「참고 이미지와 비슷하게」(참고 선택 시만 활성) / 「이미지에 어울리게 자동」.
- [ ] 뮤테이션 input에 overlayMode·overlayFont·overlayColor·aiTypoStyle 전달.
- [ ] 시안 카드: AI 모드 생성물엔 「AI 타이포」 태그(클린 원본 링크 없음), 서버 모드는 기존 「문구 합성」 태그 + 폰트·색상 병기.
- [ ] 「이 요구사항으로 다시 생성」 → 방식·폰트·색상까지 프리필 승계.
- [ ] i18n ko+zhTw 전 키.

## Task 4: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용(dev), build·서버 전체 테스트·e2e 6종 무수정, mock 브라우저(카드 미리보기·모드 전환·승계)
- [ ] 라이브 2건: 서버 합성 명조+골드 1장($0.04) + AI 타이포 1장($0.04)
- [ ] 폰트 2종 커밋 확인, 커밋·배포(main 푸시=나스 자동)

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

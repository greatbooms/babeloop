# 이미지 문구 합성 — 연출 재료와 삽입 문구 분리, 서버 오버레이

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** 검토 이미지 생성에서 ① 브리프·확정 문구는 지금처럼 **연출 재료**로만 쓰고(AI는 글자 없는 클린 이미지 + 문구 여백), ② 「이미지에 넣을 문구」(메인+서브 2단)를 별도 입력받아 **서버가 ffmpeg drawtext + Noto Sans TC Bold로 합성**한다. AI가 그리는 CJK가 뭉개지는 실측 문제(1200×628 라이브에서 확인)의 해법. 클린 원본과 합성본 둘 다 보관.

**전제 사실:**
- 폰트는 이미 준비됨: `apps/server/assets/fonts/NotoSansTC-Bold.otf` (Claude가 다운로드, 커밋 예정). Dockerfile은 `COPY . .`라 자동 포함. 경로 해석: `path.join(process.cwd(), 'apps/server/assets/fonts/NotoSansTC-Bold.otf')` — dev·docker 모두 cwd=repo 루트. 없으면 명확한 에러로 잡 실패(침묵 폴백 금지).
- ffmpeg는 ffmpeg-static 기존 사용(image-resize.ts 패턴 재사용).
- 현재 프롬프트 버그 2건(이 계획에서 수정): (a) `generation.prompts.ts` 연출 지침에 "세로 9:16 모바일 화면" 하드코딩 — 규격 프리셋 지시와 충돌 (b) 규격군 프롬프트의 "텍스트 공간 확보" 표현을 모델이 "텍스트를 그리라"로 오독 → 라이브에서 깨진 한자 렌더링 발생.

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가(SQL 수동 작성). **AI 라이브 호출 0** — mock으로만.
- **Playwright e2e 6종 무수정 통과.** 주의: 모달 문구 프리필로 e2e의 이미지 생성 흐름이 오버레이 경로를 타게 된다 — mock 20×20 PNG도 리사이즈(1200×1200 업스케일) 후 합성이 정상 동작해야 한다.
- 서버 포트 16000. i18n ko+zhTw 전 키. 기존 promptVersion·AiExecutionLog·enqueueOrRetry 체계 유지.
- drawtext에 사용자 문구를 직접 넣지 말 것 — 이스케이프 지옥. **`textfile=` 옵션으로 temp 파일 경유** (한 줄당 파일 1개).

---

## Task 1: 프롬프트 정리 (충돌 제거 + 텍스트 금지 강화)

**Files:** `apps/server/src/modules/generation/generation.prompts.ts`, `apps/server/src/modules/generation/image-size-presets.ts`, `apps/server/src/queues/creative-generation.processor.ts`, 관련 spec

- [ ] `generation.prompts.ts` 연출 지침에서 `- 세로 9:16 모바일 화면을 상정한 구도. 주 피사체는 중앙~상단, 하단 1/3은 광고 문구가 얹힐 여백으로 비워두라.` 줄 삭제 — 구도는 규격 프리셋 섹션이 소유한다. (buildImagePrompt 호출처 전수 확인: 규격 섹션이 항상 병기되는지. 프리셋 없이 호출되는 경로가 남아 있으면 그 경로에도 기본 프리셋 섹션을 병기.)
- [ ] 금지 조항 강화: `- 텍스트 오버레이 없음. ...` 줄을 `- 이미지 안에 어떤 문자도 그리지 마라 — 한글·한자·영문·숫자·타이포그래피·로고·워터마크 전부. 문구 자리는 빈 공간으로만 남겨라 (문구는 생성 후 별도 합성된다).`로 교체.
- [ ] `image-size-presets.ts` GROUP_PROMPTS 재작성 — "텍스트"라는 단어가 그리기 지시로 오독되지 않게:
  - square: `정사각형에 가까운 구도 — 핵심 인물을 중앙에 크게, 하단 1/3은 문구가 나중에 얹힐 빈 여백(글자는 그리지 말 것)`
  - portrait: `세로형 구도 — 인물 상반신을 상단~중앙에, 하단은 문구가 나중에 얹힐 빈 여백으로 단순하게`
  - landscape: `가로형 구도 — 인물을 한쪽에 배치, 반대쪽은 문구가 나중에 얹힐 단순한 빈 공간`
  - banner: `초광폭 배너 구도 — 인물은 좌우 가장자리, 중앙은 문구가 나중에 얹힐 단순한 배경. 상하가 크게 잘리므로 얼굴을 세로 중앙 높이에 배치`
- [ ] promptVersion `generate-copy-images@v3` → `@v4` (프로세서), 관련 spec 단언 갱신.

## Task 2: 오버레이 렌더러

**Files:** `apps/server/src/common/media/text-overlay.ts`(신규), `apps/server/src/common/media/text-overlay.spec.ts`(신규)

- [ ] `computeOverlayLayout(input: { width; height; group: 'square'|'portrait'|'landscape'|'banner'; headline: string; subline?: string })` 순수 함수:
  - headline 폰트 크기 `Math.max(16, Math.round(width / 20))`, subline은 headline의 0.6배 반올림.
  - 줄바꿈: CJK 폭≈폰트크기 가정, 한 줄 최대 글자수 `Math.floor(width * 0.92 / fontSize)`. headline 최대 2줄 — 넘치면 폰트 10%씩 축소 반복(최소 16). subline은 1줄 — 넘치면 축소.
  - 세로 앵커(텍스트 블록 중심의 height 비율): square 0.74 / portrait 0.78 / landscape 0.60 / banner 0.50. 줄 간격 headline 줄 사이 `0.35 * fontSize`, headline↔subline 사이 `0.5 * headlineFontSize`.
  - 반환: `lines: Array<{ text; fontSize; y }>` (y는 각 줄 상단 px), 가로는 렌더러가 `x=(w-text_w)/2` 중앙 정렬.
- [ ] `renderTextOverlay(buffer, layout): Promise<Buffer>` — temp 디렉터리에 입력 이미지·**줄당 textfile** 저장 후 ffmpeg 1회 실행. drawtext 필터 체인: 각 줄 `drawtext=fontfile='{FONT}':textfile='{file}':fontsize={n}:fontcolor=white:x=(w-text_w)/2:y={y}:shadowcolor=black@0.55:shadowx={s}:shadowy={s}` (s=`Math.max(2, Math.round(fontSize/22))`). 출력 PNG 버퍼. 폰트 부재 시 throw.
- [ ] 유닛: 레이아웃(줄바꿈·축소·앵커) 3건 + 실제 작은 PNG에 합성해 출력이 유효 PNG이고 입력과 바이트가 달라짐 1건.

## Task 3: 스키마·입력·잡 흐름

**Files:** `prisma/schema.prisma` + `prisma/migrations/20260814090000_image_text_overlay/migration.sql`(신규), `apps/server/src/modules/generation/brief.inputs.ts`, `apps/server/src/modules/review/review.service.ts`·`review.models.ts`(검토 상세 images 노출부), `apps/server/src/queues/creative-generation.processor.ts`, 관련 spec

- [ ] GeneratedImage에 `overlayHeadline String?`, `overlaySubline String?`, `cleanStorageKey String?` 추가. SQL: `ALTER TABLE "generated_images" ADD COLUMN "overlayHeadline" TEXT, ADD COLUMN "overlaySubline" TEXT, ADD COLUMN "cleanStorageKey" TEXT;`
- [ ] `GenerateCreativeImagesInput`에 `overlayHeadline?: string`, `overlaySubline?: string` (각 최대 60자 검증, subline은 headline 있을 때만 허용 — 위반 시 BAD_USER_INPUT). 잡 payload로 전달.
- [ ] 프로세서 저장 흐름 (이미지별): 리사이즈 → headline 있으면: 클린본을 `...{uuid}-clean.png`로 저장 + 합성본을 기존 키 규칙으로 저장, `cleanStorageKey`·`overlayHeadline`·`overlaySubline` 기록. headline 없으면 기존과 동일(클린본이 storageKey, cleanStorageKey null). 합성 실패는 잡 실패(원본만 저장하고 성공 처리 금지).
- [ ] 검토 상세 images 모델에 `overlayHeadline`, `overlaySubline`, `cleanUrl`(cleanStorageKey presign, 없으면 null) 노출.
- [ ] 유닛: 오버레이 있는 잡이 두 키 저장+필드 기록 1건, 없는 잡은 기존 동작 1건, subline 단독 거부 1건.

## Task 4: 검토 UI

**Files:** `apps/web/src/pages/ReviewDetailPage.tsx`, `apps/web/src/i18n/messages.ts`, `apps/web/src/lib/full-guide.ts`(한 줄), `review.css`(필요시)

- [ ] 이미지 생성 모달에 「이미지에 넣을 문구」 섹션 (규격 select 아래): 메인 문구 input + 서브 문구 input. 프리필: 승인 zh-TW 최신본(latestLocalization.text)의 첫 줄 → 메인, 둘째 줄 있으면 → 서브 (zh-TW 없으면 koreanText 기준). 모달 열 때마다 재계산. 비우면 합성 안 함 안내 힌트: `비우면 글자 없는 클린 이미지로 생성됩니다`.
- [ ] 뮤테이션 input에 overlayHeadline/overlaySubline 전달 (trim, 빈 문자열은 undefined).
- [ ] 시안 카드: 합성본이 기본 표시(기존 url). `overlayHeadline` 있으면 캡션에 문구 합성 태그 + 「클린 원본」 다운로드 링크(cleanUrl).
- [ ] 「이 요구사항으로 다시 생성」 → 그 시안의 overlayHeadline/overlaySubline도 프리필에 승계 (규격·참고와 동일 패턴).
- [ ] i18n ko+zhTw 전 키.

## Task 5: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용(dev), build·서버 테스트 전체·e2e 6종 무수정, mock 브라우저(프리필·클린 링크·재생성 승계)
- [ ] 라이브 1건: 908×226 배너 + 실제 zh-TW 문구 합성 ($0.06) — 클린 여백·합성 품질 실측
- [ ] 폰트 파일 커밋 확인, 커밋·배포(main 푸시=나스 자동)

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

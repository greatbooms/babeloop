# 참고 이미지 기반 생성 — 이미지(최대 16장 참조) + 영상(첫 프레임 참조)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** 검토의 이미지·영상 생성이 텍스트 프롬프트만이 아니라 **참고 이미지**를 함께 쓰도록 확장한다. ① 이미지: 기존 시안·브리프 참조 경쟁 광고·미디어 자산 중 복수 선택(최대 16) → gpt-image-1 `images/edits`(input_fidelity high)로 스타일·인물 유지 생성 ② 영상: 그 브리프의 시안 1장을 `input_reference`로 → 이미지와 톤이 이어지는 Sora 영상 ③ 시안 카드 「이 요구사항으로 다시 생성」이 그 시안을 참고로 자동 선택(진짜 반복 개선).

**API 사실 (확인됨):**
- `POST /v1/images/edits` — gpt-image-1, `image`(파일 배열, 최대 16장·각 50MB, PNG/WEBP/JPG), `prompt`(32k자), `n`, `quality`, `size`, `input_fidelity: high|low`. 응답 b64_json. openai SDK(^4.80) `client.images.edit` + `toFile` 지원.
- `POST /v1/videos` — 기존 구현에 `input_reference` 필드 추가(이미지 파일 1장, multipart). 기존 비디오 프로바이더가 fetch 기반이면 FormData로 파일 첨부.

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가(SQL 수동 작성). **AI 라이브 호출 0** — mock으로만.
- Playwright e2e 6종 무수정. 서버 포트 16000. i18n(ko+zhTw) 전 키. 기존 디자인 체계 재사용.
- BullMQ enqueueOrRetry, promptVersion 갱신(generate-copy-images@v2, generate-video@v2), AiExecutionLog 기록 유지.
- 참고 이미지 로드는 storage.getBuffer(storageKey) — presign URL을 다시 fetch하지 말 것.

---

## Task 1: 프로바이더 확장 (mock + openai)

**Files:** `apps/server/src/providers/image/*`, `apps/server/src/providers/video/*` (+각 spec)

- [ ] ImageGenerationProvider.generate 입력에 `referenceImages?: Array<{ buffer: Buffer; contentType: string }>` 추가.
- [ ] openai 이미지: referenceImages 있으면 `client.images.edit({ model, image: [toFile(buffer, 'ref-N.png', {type})...], prompt, n: count, quality, size, input_fidelity: 'high' })`, 없으면 기존 generate. 비용 추정은 기존과 동일(출력 장수 기준).
- [ ] VideoGenerationProvider.generate 입력에 `inputReference?: { buffer: Buffer; contentType: string }` 추가. openai 비디오: multipart FormData에 `input_reference` 파일 첨부(있을 때만).
- [ ] mock 두 프로바이더: 참조 입력을 받아도 기존 결정적 출력 유지(참조 개수를 로그성 필드로 반환할 필요 없음).
- [ ] 유닛 테스트: 이미지 edit 분기 선택 1건(참조 있으면 edit 호출), mock 형태 유지 1건.

## Task 2: 스키마·잡·GraphQL

**Files:** `prisma/schema.prisma` + `prisma/migrations/20260812090000_reference_guided_generation/migration.sql`(신규), `apps/server/src/modules/generation/brief.inputs.ts`·`brief.service.ts`, `apps/server/src/modules/review/review.models.ts`(필요시), `creative-generation.processor.ts`, `generation.prompts.ts`

- [ ] GeneratedImage·GeneratedVideo에 `referenceKeys String[] @default([])` 추가. 마이그레이션 SQL: `ALTER TABLE ... ADD COLUMN "referenceKeys" TEXT[] NOT NULL DEFAULT '{}';` 두 테이블.
- [ ] GraphQL enum `GenerationReferenceKind { GENERATED_IMAGE SOURCE_AD MEDIA_ASSET }` + input `GenerationReferenceInput { kind, id }`.
- [ ] GenerateCreativeImagesInput에 `references: [GenerationReferenceInput!]`(선택, 최대 16 검증). GenerateCreativeVideoInput에 `referenceImageId: ID`(선택 — GeneratedImage id).
- [ ] 참조 해석 로직(brief.service 공용 헬퍼): kind별 storageKey 결정 —
  GENERATED_IMAGE→generated_images.storageKey / SOURCE_AD→그 광고 mediaAsset의 이미지 원본 키(영상 광고면 thumbnailKey) / MEDIA_ASSET→media_assets의 이미지 원본(영상이면 thumbnailKey). 대상 부재·이미지 키 없음이면 GraphQLError(BAD_USER_INPUT, 어떤 참조가 문제인지 명시).
- [ ] 잡 payload에 referenceKeys 배열(이미지)·referenceKey(영상) 전달. 프로세서: storage.getBuffer로 버퍼 로드(contentType은 키 확장자 기반 png/jpeg 추정) → provider에 전달 → 저장 시 referenceKeys 기록 + **프롬프트 문자열 끝에 `## 참고 이미지: N장\n- {key}...` 병기**(추적용 프롬프트 전문에 자연 노출).
- [ ] promptVersion: 참조 사용 시 `generate-copy-images@v2` / `generate-video@v2`, 미사용 시 기존 버전 유지.
- [ ] 검토 상세 노출 보강: CreativeDetailModel에 참조 선택 UI용 데이터 —
  `briefReferenceAds: [{ sourceAdId, title, thumbnailUrl }]`(그 문구 브리프의 참조 광고 중 이미지 썸네일 있는 것), 기존 images(브리프 시안)는 이미 있음. 미디어 자산은 기존 mediaAssets 목록 쿼리 재사용(최근 24개면 충분 — 필요시 간단 쿼리 추가).
- [ ] 유닛 테스트: 프로세서가 참조 버퍼를 provider에 전달·referenceKeys 저장 1건, 참조 해석 오류 1건.

## Task 3: 검토 UI

**Files:** `apps/web/src/pages/ReviewDetailPage.tsx`, `review.css`, `messages.ts`, `full-guide.ts`(검토 단계 한 줄)

- [ ] 이미지 생성 모달에 「참고 이미지 (선택)」 섹션: 세 그룹을 가로 스크롤 썸네일로 —
  ① 이 브리프의 시안(creative.images + 브리프 모아보기) ② 브리프 참조 경쟁 광고(briefReferenceAds) ③ 미디어 자산(최근). 클릭 토글 선택(체크 오버레이), 상단에 '선택 N/16'. 선택 없으면 기존 동작.
- [ ] 「input_fidelity」는 노출하지 않음(서버 high 고정). 안내 문구: '참고 이미지의 인물·스타일을 유지하며 생성합니다'.
- [ ] 영상 생성 모달에 「첫 프레임 참고 (선택)」: 그 브리프의 시안 썸네일 중 1장 라디오 선택.
- [ ] 시안 카드 「이 요구사항으로 다시 생성」 → 그 시안을 참고로 **자동 선택**한 채 모달 열기(요구사항 프리필 유지).
- [ ] 생성물 캡션에 참고 사용 표시('참고 N장'), 프롬프트 전문 펼침에는 Task 2의 병기로 자동 포함. i18n ko+zhTw.

## Task 4: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용(dev+나스), build·서버 테스트 전체·e2e 6종 무수정
- [ ] mock 브라우저: 참조 선택 UI·자동 선택 재생성 흐름
- [ ] 라이브 1건: 기존 시안 1장 참고 + 저품질 1장($0.04)로 스타일 유지 실측
- [ ] 커밋·배포(main 푸시)

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

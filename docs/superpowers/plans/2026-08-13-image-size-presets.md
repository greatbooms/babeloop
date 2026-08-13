# 이미지 규격 프리셋 — 검토 이미지 생성에 광고 규격 7종 선택

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** 검토의 이미지 생성 시 실제 광고 집행 규격 7종 중 하나를 선택한다. gpt-image-1은 1024×1024·1536×1024·1024×1536만 출력하므로 ① 목표 비율에 가장 가까운 네이티브 크기로 생성 + 프롬프트에 규격별 구도 지시 자동 병기 → ② 완료 후 ffmpeg 중앙 크롭 + lanczos 리사이즈로 정확한 픽셀 규격을 만든다.

**규격 프리셋 (BabeChat 실집행 샘플 7종 — 상수로 정의):**

| preset id | 출력 W×H | 비율 | 네이티브 생성 크기 | 구도군 |
|---|---|---|---|---|
| `square_1200x1200` | 1200×1200 | 1:1 | 1024x1024 | square |
| `landscape_600x500` | 600×500 | 6:5 | 1024x1024 | square |
| `portrait_960x1200` | 960×1200 | 4:5 | 1024x1536 | portrait |
| `portrait_300x500` | 300×500 | 3:5 | 1024x1536 | portrait |
| `landscape_1200x628` | 1200×628 | 1.91:1 | 1536x1024 | landscape |
| `banner_600x200` | 600×200 | 3:1 | 1536x1024 | banner |
| `banner_908x226` | 908×226 | 4:1 | 1536x1024 | banner |

기본값(UI·미지정)은 `square_1200x1200`.

**구도군별 프롬프트 지시 (한국어, 생성 프롬프트 끝에 `## 출력 규격` 섹션으로 병기):**
- 공통: `## 출력 규격: {W}x{H} ({비율}) — 네이티브 {native}로 생성 후 중앙 크롭되므로 중요한 요소(얼굴·핵심 오브젝트)를 가장자리에 두지 말 것`
- square: `정사각형에 가까운 구도 — 핵심 인물을 중앙에 크게, 하단 1/3은 텍스트 오버레이 여백`
- portrait: `세로형 구도 — 인물 상반신을 상단~중앙에, 하단은 텍스트 공간으로 단순하게`
- landscape: `가로형 구도 — 인물을 한쪽에 배치, 반대쪽은 텍스트 공간 확보`
- banner: `초광폭 배너 구도 — 인물은 좌우 가장자리, 중앙은 텍스트용 단순 배경. 상하가 크게 잘리므로 얼굴을 세로 중앙 높이에 배치`

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가(SQL 수동 작성). **AI 라이브 호출 0** — mock으로만.
- **Playwright e2e 6종 무수정 통과.** 모달의 규격 select는 기본값 `square_1200x1200`로 렌더 — 기존 e2e가 select를 건드리지 않아도 흐름이 그대로여야 한다. mock 이미지 프로바이더의 기존 결정적 출력 문자열/바이트 불변.
- 서버 포트 16000. i18n ko+zhTw 전 키. enqueueOrRetry·AiExecutionLog(비용 포함) 유지.
- **mock 프로바이더 출력이 유효한 PNG가 아니면 ffmpeg 리사이즈가 죽는다** — 먼저 mock 출력을 확인하고, 유효 PNG가 아니면 최소 유효 PNG(1×1)로 교체하되 e2e가 바이트 내용을 단언하지 않는지 grep으로 확인할 것 (단언이 있으면 리사이즈를 프로바이더가 아닌 프로세서에서 하되 실패 시 원본 저장으로 두지 말고 잡 실패 처리 — 침묵 폴백 금지).

---

## Task 1: 프리셋 상수 + ffmpeg 리사이즈 헬퍼

**Files:** `apps/server/src/modules/generation/image-size-presets.ts`(신규), `apps/server/src/common/media/image-resize.ts`(신규, video-thumbnail.ts의 temp 파일 패턴 재사용), 각 spec

- [ ] `IMAGE_SIZE_PRESETS` 상수: 위 표 그대로 `{ id, width, height, nativeSize: '1024x1024'|'1536x1024'|'1024x1536', group: 'square'|'portrait'|'landscape'|'banner', label: '1200×1200 (1:1)' ... }`. `resolveSizePreset(id?: string)` — 미지정이면 square_1200x1200, 모르는 id면 GraphQLError(BAD_USER_INPUT, 허용 목록 명시).
- [ ] `buildSizePromptSection(preset)` — 위 공통+구도군 지시 문자열 생성.
- [ ] `resizeImageToSpec(buffer: Buffer, width: number, height: number): Promise<Buffer>` — temp 파일에 쓰고 `ffmpeg -i in -vf "crop='min(iw,ih*{W/H})':'min(ih,iw/{W/H})',scale={W}:{H}:flags=lanczos" -frames:v 1 out.png` 실행, PNG 버퍼 반환. 실패 시 throw(침묵 폴백 금지).
- [ ] 유닛: 프리셋 해석(기본값·오류), 작은 실제 PNG를 만들어 리사이즈 후 크기 검증 1건(ffmpeg 실행 — CI 아닌 로컬 기준).

## Task 2: 스키마·프로바이더·잡

**Files:** `prisma/schema.prisma` + `prisma/migrations/20260813180000_image_size_presets/migration.sql`(신규), `apps/server/src/providers/image/*`, `apps/server/src/modules/generation/brief.inputs.ts`·`brief.service.ts`, `apps/server/src/queues/creative-generation.processor.ts`, 관련 spec

- [ ] GeneratedImage에 `sizePreset String?` 추가. SQL: `ALTER TABLE "generated_images" ADD COLUMN "sizePreset" TEXT;` (null=기존 1024² 시안).
- [ ] `ImageGenerationInput`에 `size?: '1024x1024' | '1536x1024' | '1024x1536'` 추가. openai 프로바이더: generate·edits 두 경로 모두 size 전달(기본 1024x1024). 비용 추정: 비정사각(1536×1024·1024×1536)은 기존 장당 추정치의 1.5배.
- [ ] mock 프로바이더: size를 받아도 기존 결정적 출력 유지.
- [ ] `GenerateCreativeImagesInput`에 `sizePreset?: string` 추가(resolve로 검증).
- [ ] 잡 payload에 sizePreset 전달. 프로세서: ① 프롬프트에 `buildSizePromptSection` 병기(참고 이미지 병기와 같은 방식 — 추적 프롬프트 전문에 자연 노출) ② provider에 nativeSize 전달 ③ 결과 버퍼마다 `resizeImageToSpec`로 정확한 규격 변환(contentType 'image/png') ④ 저장 시 `sizePreset` 기록.
- [ ] promptVersion: sizePreset이 관여한 생성은 `generate-copy-images@v3` (참조 유무 무관). GraphQL 미지정 기본값도 프리셋이므로 신규 생성은 사실상 v3.
- [ ] 검토 상세 모델(CreativeDetailModel images)에 `sizePreset` 노출.
- [ ] 유닛: 프로세서가 size 전달+리사이즈 호출+sizePreset 저장 1건, 잘못된 preset 거부 1건, openai 프로바이더 size 전달 분기 1건.

## Task 3: 검토 UI

**Files:** `apps/web/src/pages/ReviewDetailPage.tsx`, `review.css`(필요시), `apps/web/src/i18n/messages.ts`, `apps/web/src/i18n/full-guide.ts`(검토 단계 한 줄)

- [ ] 이미지 생성 모달에 「광고 규격」 select — 7종 프리셋 label 노출(`1200×1200 정사각 (1:1)` 형식, ko+zhTw), 기본 `square_1200x1200`. 선택값을 generateCreativeImages input의 sizePreset으로 전달.
- [ ] 시안 카드 캡션에 규격 표시(`sizePreset` 있을 때 `1200×628` 형식, 없으면 미표시).
- [ ] 「이 요구사항으로 다시 생성」 → 그 시안의 sizePreset을 select에 자동 선택(요구사항·참고 자동 선택 프리필과 동일 패턴).
- [ ] 안내 문구: 규격 select 아래 `배너형(3:1·4:1)은 상하 크롭 폭이 커서 완성도가 떨어질 수 있습니다` 힌트(ko+zhTw).
- [ ] i18n ko+zhTw 전 키.

## Task 4: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용(dev), build·서버 테스트 전체·e2e 6종 무수정
- [ ] mock 브라우저: 규격 선택·캡션·재생성 프리필
- [ ] 라이브 1건: 1200×628 저품질 1장으로 구도 지시+크롭 실측 (~$0.06)
- [ ] 커밋·배포(main 푸시=나스 자동)

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

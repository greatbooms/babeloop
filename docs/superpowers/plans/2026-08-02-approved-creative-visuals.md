# 승인 확정본 기반 비주얼 생성 — 문구별 이미지 + 장면표 기반 영상

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법.

**Goal (사용자 승인 완료):** 검토에서 **최종 승인(APPROVED)된 확정본**을 재료로 비주얼을 생성한다. ① 승인된 문구(COPY) → 「이 문구로 이미지 시안 생성」: 브리프 전략 + 승인 문구(ko·zh)를 반영한 **문구 전용 이미지**. ② 승인된 영상 스크립트(VIDEO_SCRIPT) → 「이 장면표로 영상 생성」: 승인 장면표를 프롬프트로 **실제 영상**(OpenAI Sora). 내보내기 키트는 문구 전용 이미지를 우선 포함하고 영상 파일도 포함해, 확정 문구와 비주얼이 같은 메시지의 세트로 실험에 나간다. 브리프 단계 이미지 생성은 방향 탐색용으로 유지.

**API 사실 (확인됨):** `POST /v1/videos` — model `sora-2`(기본)|`sora-2-pro`, `seconds` "4"|"8"|"12"(문자열), `size` "720x1280"(세로 9:16, 기본) 등. 비동기 잡: status queued→in_progress→completed, `GET /videos/{id}`로 폴링, `GET /videos/{id}/content`로 mp4 다운로드. 가격은 환경변수로: `VIDEO_PRICE_PER_SECOND_USD` 기본 0.10 (sora-2 720p 기준 12초 ≈ $1.20).

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가 → 마이그레이션 SQL 수동 작성. 적용은 Claude.
- **AI 라이브 호출 0 — 특히 영상은 회당 $1+라 절대 금지.** mock 프로바이더는 결정적 바이트 반환. 라이브 검증은 Claude 담당(영상은 사용자 승인 후).
- **비용 3중 방어**: ① create-test-app.ts에 `VIDEO_PROVIDER='mock'` 강제 + `VIDEO_API_KEY` 삭제(기존 5종 블록에 추가) ② package.json e2e:stack mock 목록에 VIDEO_PROVIDER=mock 추가 ③ .env.example에 VIDEO_* 문서화. .env에는 VIDEO_PROVIDER=openai로 설정하되 호출 금지.
- Playwright e2e 6종(e2e/slice0~5.spec.ts) 스펙 무수정 통과가 합격선. 서버 포트 16000.
- UI 문자열 전부 i18n(messages.ts ko+zhTw), 기존 디자인 체계(모달·카드·태그 칩·잡 폴링 패턴) 재사용. BullMQ jobId 구분자 `--`, enqueueOrRetry, AiExecutionLog.record(비용 포함) 필수.
- `apps/server/test/review-flow.e2e-spec.ts`가 내보내기 본문·manifest를 검증 — 형식 변경 시 함께 갱신(의도된 변경).

---

## Task 1: 비디오 프로바이더 (mock + OpenAI Sora)

**Files:** `apps/server/src/providers/video/video-generation.provider.ts`(신규), `mock-video-generation.provider.ts`, `openai-video-generation.provider.ts`, `video.module.ts`, `apps/server/src/app.module.ts`·`worker.module.ts` 등록, `.env`·`.env.example`, `apps/server/test/create-test-app.ts`, `package.json`(e2e:stack)

- [ ] 인터페이스: `generate(input: { prompt: string; seconds: 4 | 8 | 12; size?: string }): Promise<{ video: { buffer: Buffer; contentType: string }; costEstimateUsd?: number }>` + `name`·`model` 노출. 이미지 프로바이더(image-generation.provider.ts) 패턴 그대로.
- [ ] mock: 내장 base64 소형 MP4(수 KB, 결정적) 반환. costEstimateUsd = seconds × 단가.
- [ ] openai: `POST /v1/videos`(model=VIDEO_MODEL, seconds 문자열화, size 기본 '720x1280') → 2~5초 간격 폴링(`GET /videos/{id}`), status failed면 error.message로 throw, completed면 `GET /videos/{id}/content` mp4 Buffer. 전체 타임아웃 10분. 비용 = seconds × VIDEO_PRICE_PER_SECOND_USD.
- [ ] env: `VIDEO_PROVIDER=mock|openai`, `VIDEO_MODEL=sora-2`, `VIDEO_API_KEY`(미설정 시 TEXT_AI_API_KEY 폴백), `VIDEO_PRICE_PER_SECOND_USD=0.10`. env.validation.ts에 optional로 추가.
- [ ] 3중 방어 적용(위 환경 제약 ①②③).
- [ ] 유닛 테스트: mock 반환 형태 1건.

## Task 2: 스키마 + 잡

**Files:** `prisma/schema.prisma` + `prisma/migrations/20260802120000_approved_creative_visuals/migration.sql`(신규, SQL 수동 작성), `queue.constants.ts`, `creative-generation.processor.ts`, `apps/server/src/modules/generation/*`(뮤테이션·모델·프롬프트)

- [ ] GeneratedImage에 `creativeId String?` + `creative GeneratedCreative? @relation(fields:[creativeId], references:[id], onDelete: SetNull)` + `@@index([creativeId])`. GeneratedCreative에 `images GeneratedImage[]`.
- [ ] `GeneratedVideo` 모델: id cuid, creativeId(→GeneratedCreative, Cascade), storageKey, contentType('video/mp4'), seconds Int, size String, prompt, instructions String?, provider, model, promptVersion, costEstimateUsd Decimal?, createdAt. `@@index([creativeId])` `@@map("generated_videos")`. GeneratedCreative에 `videos GeneratedVideo[]`.
- [ ] 마이그레이션 SQL: ALTER TABLE generated_images ADD COLUMN "creativeId" TEXT (+FK SET NULL, index); CREATE TABLE generated_videos (+FK CASCADE, index).
- [ ] 뮤테이션 `generateCreativeImages(input: { creativeId: ID!, instructions: String, count: Int = 2, quality: String = 'low' }) → JobModel`: 대상 type COPY && status APPROVED 검증(아니면 GraphQLError 'APPROVED 문구에서만 생성할 수 있습니다'), count 1~4·quality low|high 검증, jobId `generate-images--{creativeId}--{uuid}` (기존 GENERATE_IMAGES 잡 재사용, payload에 creativeId 추가).
- [ ] 프로세서 GENERATE_IMAGES 확장: payload.creativeId 있으면 문구+브리프 로드, 프롬프트 = 기존 v2 이미지 프롬프트 구조에 `## 확정 광고 문구 (이미지는 이 문구가 말하는 순간을 그려야 한다)\n한국어: {koreanText}\nzh-TW(승인본): {승인 localization 있으면}` 섹션 추가. promptVersion `generate-copy-images@v1`. GeneratedImage 생성 시 briefId=문구의 briefId, creativeId 세팅. 없으면 기존 브리프 경로 그대로(generate-images@v2).
- [ ] 뮤테이션 `generateCreativeVideo(input: { creativeId: ID!, seconds: Int = 12, instructions: String }) → JobModel`: 대상 type VIDEO_SCRIPT && status APPROVED 검증, seconds 4|8|12 검증, JOB_TYPES.GENERATE_VIDEO 신설, jobId `generate-video--{creativeId}--{uuid}`.
- [ ] 프로세서 GENERATE_VIDEO 케이스: 문구(장면표)+브리프+브랜드 로드 → 프롬프트 조립: 장면표(scenes JSON)를 "0-3초: [연출]... " 연속 숏 지시문으로 압축 + 브리프 훅·욕구 + '세로 9:16 숏폼 광고. 화면 내 텍스트·자막·로고 없음(자막은 후반 작업). 등장인물은 20대 이상 성인.' + instructions(있으면 우선) → provider.generate → `generated-videos/{creativeId}/{uuid}.mp4` putBuffer → GeneratedVideo 레코드 → AiExecutionLog.record(비용) → markSucceeded(videoId). promptVersion `generate-video@v1`.
- [ ] GraphQL 노출: 검토 상세 CreativeDetailModel에 `images: [...]`(creativeId 연결분, url presign·quality·instructions·createdAt·costEstimateUsd) + `videos: [...]`(url presign·seconds·size·costEstimateUsd·createdAt). 기존 briefImages는 유지(브리프 공용 표시용).
- [ ] 유닛 테스트: GENERATE_VIDEO 프로세서가 mock 영상을 저장·기록 1건, 문구 기반 이미지 프롬프트에 koreanText 포함 1건.

## Task 3: 검토 UI

**Files:** `apps/web/src/pages/ReviewDetailPage.tsx`, `review.css`(필요시), `apps/web/src/i18n/messages.ts`

- [ ] 문구(COPY) 검토 상세, status APPROVED일 때 헤더에 「이 문구로 이미지 시안 생성」 버튼(비용 힌트 저품질 ~$0.04/장·고품질 ~$0.19/장) → 모달: 브리프 이미지 모달과 같은 구성(추가 요구사항 textarea+예시 안내 재사용 가능하면 재사용, 장수 1~4 기본 2, 품질 select) → generateCreativeImages 호출, 잡 폴링(기존 패턴), 완료 시 refetch.
- [ ] 「이 문구 전용 시안」 카드: creative.images 갤러리(브리프 공용 시안 카드와 별도, 라벨로 구분). 내보내기에 이 시안이 우선 포함된다는 안내 한 줄.
- [ ] 스크립트(VIDEO_SCRIPT) 검토 상세, status APPROVED일 때 「이 장면표로 영상 생성」 버튼(비용 힌트: 길이×$0.10, 12초 ≈ $1.20 — 버튼과 모달 양쪽에 명시) → 모달: 길이 select 4/8/12초(각 비용 병기, 기본 12), 추가 요구사항 textarea, 「생성 시작」. 잡 폴링(영상은 수 분 소요 안내 문구).
- [ ] 「생성된 영상」 카드: `<video controls>` 재생(presign url), 길이·해상도·비용·생성일 캡션. 없으면 표시 안 함.
- [ ] 잡 활성 시 pollFast 조건 포함. i18n ko+zhTw 전 키.
- [ ] **VIDEO_SCRIPT 중복 표시 제거 (사용자 지적)**: 스크립트 검토 상세에서 문구 카드의 원문 열(평문 스크립트)이 장면표와 같은 내용을 중복 표시한다. 스크립트일 때는 ① 장면표 카드를 먼저 배치하고 ② 문구 카드는 원문 열 없이 **zh-TW 최신본(+역번역)만 단일 열**로 표시(카드 제목은 review.latestZh 재사용 또는 신규 키 '번체중문 검수본'/zh '繁體中文審閱稿'). COPY 검토는 현행 2열 유지. 검수 수정 액션 UI는 기존 그대로.

## Task 4: 내보내기 연계

**Files:** `apps/server/src/modules/experiment/export.service.ts`, `apps/server/test/review-flow.e2e-spec.ts`

- [ ] 문구 변형: 해당 문구의 creativeId 연결 이미지가 있으면 **그것만** `{trackingCode}-IMG{n}.png`로 포함(문구 전용 우선), 없으면 기존 브리프 이미지 폴백(현행 유지).
- [ ] 스크립트 변형: GeneratedVideo 있으면 `{trackingCode}-VID{n}.mp4` 포함, txt에 "영상:" 줄(없으면 "영상: 없음"), manifest에 `videoFilenames` 열(세미콜론 구분).
- [ ] review-flow 통합 테스트: manifest 헤더·본문 변경분 갱신(의도된 변경), 문구 전용 이미지 우선 시나리오 1건 추가.

## Task 5: 가이드·안내 갱신

**Files:** `apps/web/src/lib/full-guide.ts`, `apps/web/src/lib/page-guides.tsx`(검토 항목), `messages.ts`

- [ ] 추천 워크플로를 새 흐름으로 갱신(ko+zh): 브리프 이미지는 "방향 탐색(무드보드)", **확정 비주얼은 승인 후 검토 상세에서** — ① 문구 승인 → 그 문구로 이미지 생성(전용 시안이 내보내기 우선) ② 장면표 승인 → 영상 생성($1+ 비용 명시) ③ 내보내기 = 문구+전용 비주얼 세트.
- [ ] 브리프 이미지 모달의 워크플로 힌트(briefs.imageWorkflowHint)에도 "확정 문구가 나온 뒤에는 검토 상세에서 문구 전용 시안을 만드는 것을 권장" 한 줄 추가.

## Task 6: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용, build, 서버 테스트 전체, e2e 6종(무수정) 통과
- [ ] mock로 두 흐름 브라우저 확인 → 라이브: 문구 기반 이미지 저품질 1장($0.04) 실행. **영상 라이브(~$0.4~1.2)는 사용자 승인 후에만.**
- [ ] 커밋

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분, 테스트 갱신 내역.

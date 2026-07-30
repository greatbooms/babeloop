# 이미지 시안 생성 + 영상 스크립트 노출 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 문법.

**Goal (사용자 승인 완료):** ① 브리프에서 이미지 시안을 생성(추가 요구사항 입력 기반)해 검토에서 확인하고 내보내기 패키지에 포함 — "문구+비주얼 완성 키트". ② 서버에 이미 있는 영상 스크립트 생성(VIDEO_SCRIPT)을 UI에 노출.

**기준 구현:** 브리프 이중 언어(fa87098)·미디어 인사이트(1d3335e)의 프로바이더/잡/모달/폴링 패턴. 이미지 저장은 StorageService(MinIO) 재사용.

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가 → 마이그레이션 SQL 수동 작성. 적용은 Claude.
- **AI 라이브 호출 0 — 이미지 생성은 특히 비용이 커서 절대 금지.** mock 이미지 프로바이더는 결정적 PNG 바이트(내장 base64 1~2KB placeholder)를 반환. 라이브 1장 검증은 Claude 담당.
- **비용 누출 3중 방어 필수**: ① `create-test-app.ts`에 `IMAGE_PROVIDER='mock'` 강제 + `IMAGE_API_KEY` 삭제(기존 4개 프로바이더와 동일 블록) ② package.json `e2e:stack`의 mock 환경변수 목록에 IMAGE_PROVIDER=mock 추가 ③ `.env.example`에 IMAGE_* 항목 문서화.
- BullMQ jobId 구분자 `--`, enqueueOrRetry 사용. promptVersion 신설·기록. AiExecutionLogService.record로 모든 호출 기록(비용 추정 포함).
- **기존 e2e 6종 스펙 수정 금지 — 무수정 통과가 합격선.** 기존 한국어 문자열·mock 출력 불변. 신규 버튼명은 기존과 충돌하지 않게(신규: 「이미지 시안 생성」「영상 스크립트 생성」「생성 시작」 재사용 가능).
- UI 문자열은 전부 i18n(messages.ts ko+zhTw, 대만 용어), 신규 화면 요소는 기존 디자인 체계(모달·태그 칩·업로드 존·brief-fields) 재사용.
- `apps/server/test/review-flow.e2e-spec.ts`가 내보내기 본문·manifest를 검증한다 — 형식 변경 시 이 테스트를 함께 갱신(의도된 변경만).

---

## Task 1: 이미지 프로바이더 (mock + OpenAI)

**Files:** `apps/server/src/providers/image/image-generation.provider.ts`(신규 인터페이스), `mock-image-generation.provider.ts`, `openai-image-generation.provider.ts`, `image.module.ts`, `apps/server/src/app.module.ts` 등록, `.env`·`.env.example`

- [ ] 인터페이스: `generate(input: { prompt: string; count: number; quality: 'low' | 'high' }): Promise<{ images: Array<{ buffer: Buffer; contentType: string }>; costEstimateUsd?: number }>` + `name`·`model` 노출.
- [ ] mock: 내장 base64 PNG(1개, 수 KB)를 count만큼 복제 반환. 결정적.
- [ ] openai: gpt-image-1 — quality low→`quality:'low'` size 1024x1024, high→`quality:'high'`. b64_json 응답을 Buffer로. 비용 추정: low $0.04/장, high $0.19/장 (환경변수 IMAGE_PRICE_LOW_USD·IMAGE_PRICE_HIGH_USD, 기본값 하드코딩 허용).
- [ ] env: `IMAGE_PROVIDER=mock|openai`, `IMAGE_MODEL=gpt-image-1`, `IMAGE_API_KEY`(미설정 시 TEXT_AI_API_KEY 폴백 — 기존 키 재사용). 실제 .env에는 IMAGE_PROVIDER=openai 로 설정해두되 호출은 하지 말 것.
- [ ] 유닛 테스트: mock 반환 형태 1건.

## Task 2: 스키마 + 생성 잡

**Files:** `prisma/schema.prisma` + 수동 마이그레이션, `apps/server/src/queues/queue.constants.ts`, `creative-generation.processor.ts`, `apps/server/src/modules/generation/*`(mutation·모델)

- [ ] `GeneratedImage` 모델: id cuid, briefId(→CreativeBrief, Cascade), storageKey, contentType, quality, instructions(추가 요구사항 원문), prompt(실제 사용 프롬프트), provider, model, promptVersion, costEstimateUsd Float?, createdAt. `@@index([briefId])` `@@map("generated_images")`. CreativeBrief에 `images GeneratedImage[]`.
- [ ] mutation `generateBriefImages(input: { briefId: ID!, instructions: String, count: Int = 2, quality: String = 'low' }) → JobModel` — count 1~4 검증, quality low|high 검증, enqueueOrRetry, jobId `generate-images--{briefId}--{uuid}`.
- [ ] 프로세서 케이스 GENERATE_IMAGES: 브리프 로드 → 프롬프트 조립(브리프의 visualFormat·hookType·desire + 브랜드명 + 사용자의 instructions; 광고용 이미지·텍스트 오버레이 없음 기본 지시; promptVersion `generate-images@v1`) → provider.generate → 각 이미지를 `generated-images/{briefId}/{uuid}.png`로 putBuffer → GeneratedImage 레코드 생성 → AiExecutionLog.record(costEstimateUsd 포함) → markSucceeded(result에 imageIds).
- [ ] GraphQL: CreativeBriefModel에 `images: [GeneratedImageModel]`(id, url(presign), quality, instructions, createdAt, costEstimateUsd) — brief 단건·목록 매핑에 presign 포함(단건만 이미지 로드해도 됨 — 목록 성능 고려해 단건 쿼리에만 포함 권장).
- [ ] 유닛 테스트: 프로세서가 mock 이미지 N장을 저장·기록하는지 1건.

## Task 3: 브리프 상세 UI — 이미지 생성 + 영상 스크립트

**Files:** `apps/web/src/pages/BriefDetailPage.tsx`, `briefs.css`, `apps/web/src/i18n/messages.ts`, `apps/web/src/lib/page-guides.tsx`

- [ ] 헤더 액션에 「이미지 시안 생성」 버튼(비용 힌트: 저품질 장당 ~$0.04 · 고품질 ~$0.19) → 모달: 추가 요구사항 textarea(placeholder: 스타일·구도·캐릭터·금지 요소), 장수 select 1~4(기본 2), 품질 select 저품질(기본)/고품질(각 비용 병기), 「생성 시작」. 잡 폴링(기존 briefJob 패턴과 별도 state), 완료 시 refetch.
- [ ] 「이미지 시안」 카드: 생성된 이미지 그리드(썸네일, 클릭 시 새 탭 원본, 품질·요구사항·비용·생성일 캡션), 없으면 빈 상태 안내.
- [ ] 헤더 액션에 「영상 스크립트 생성」 버튼(비용 힌트 ~1-2센트) → 확인 후 `generateCreativeVariants(type: VIDEO_SCRIPT, count: 2)` 호출(기존 뮤테이션 재사용), 잡 폴링.
- [ ] 「영상 스크립트」 카드: type VIDEO_SCRIPT인 변형들을 장면 테이블(초·화면·대사·자막 — scenesJson 파싱)로 표시. 문구 변형 카드에서는 VIDEO_SCRIPT 타입을 제외(현재 섞여 나오면 분리).
- [ ] 폴링 pollFast 조건에 이미지·스크립트 잡 활성 포함.

## Task 4: 검토·내보내기 연계

**Files:** `apps/server/src/modules/review/*`(브리프 이미지 노출 — CreativeDetailModel에 briefImages), `apps/web/src/pages/ReviewDetailPage.tsx`, `apps/server/src/modules/experiment/export.service.ts`, `apps/server/test/review-flow.e2e-spec.ts`(필요 시 갱신)

- [ ] 검토 상세: 해당 문구의 브리프에 이미지가 있으면 「브리프 이미지 시안」 카드로 썸네일 표시(검수자 참고용 — 승인 대상은 문구+시안 세트라는 안내 문구).
- [ ] 내보내기: 각 변형의 브리프 이미지들을 패키지에 복사(`{trackingCode}-IMG{n}.png`), files 목록·manifest에 포함(manifest에 imageFilenames 열 추가 — 세미콜론 구분). txt 지시서에 이미지 파일명 줄 추가("이미지: BL-....-IMG1.png ..." 없으면 "이미지: 없음").
- [ ] review-flow 통합 테스트: manifest 헤더 변경분 갱신(assert 깨지면 의도된 변경으로 수정).

## Task 5: 가이드·도움말 갱신

- [ ] full-guide.ts 4단계: "영상 스크립트·이미지 시안 생성도 이 단계에 추가될 예정" tips 제거하고 실제 사용법으로 교체 — 이미지 생성(추가 요구사항·품질·비용), 영상 스크립트(장면표, 촬영/외부 도구 인계), 내보내기 패키지에 이미지 포함됨(6단계에도 한 줄). ko+zh.
- [ ] page-guides.tsx briefs 항목 버튼 표에 두 버튼 추가(비용 포함).

## Task 6: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용, build + 서버 테스트 전체 + e2e 6종(스펙 무수정) 통과
- [ ] mock로 이미지 생성 흐름 브라우저 확인 → 라이브 1회: 저품질 1장(~$0.04)만 실제 생성해 화질·저장·표시·내보내기 포함 확인
- [ ] 영상 스크립트 생성 라이브 1회(~2센트) → 장면 테이블 확인
- [ ] 커밋

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분, review-flow 테스트 갱신 여부.

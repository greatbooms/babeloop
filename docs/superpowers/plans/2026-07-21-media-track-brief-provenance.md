# 미디어 독립 트랙 + 브리프 출처 명시 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (사용자 요구 2건):**
1. 수동 업로드 미디어를 광고 수집 미디어와 **분리 관리**하고, 수동 미디어에서 **자체 인사이트**(분석 + 유사 경쟁 광고 검색)를 뽑는다.
2. 브리프가 **무엇을 참고해서 만들어졌는지** (참조 광고·선택 방식·유사도·브랜드·입력 포커스·성과 환류) 저장하고 상세 화면에 명시한다.

**현재 상태 근거:**
- 미디어 탭(`MediaPage.tsx`)은 모든 MediaAsset을 표시 — CSV 임포트 광고 미디어가 섞여 나옴. 수동 업로드는 OCR/전사 외 활용 경로 없음.
- 브리프는 `sourceAdIds`(RAG 검색 결과 포함)를 저장하지만 유사도·선택 방식 미저장, 참조 광고가 삭제되면 UI에서 조용히 사라짐(`mapBrief`의 flatMap), 브랜드·포커스·성과 환류 컨텍스트는 상세 미표시.

**환경 제약 (반드시 준수):**
- git 명령 금지 (커밋은 Claude). docker·DB 필요 명령이 샌드박스에서 실패하면 건너뛰고 실행할 명령 목록으로 보고.
- 마이그레이션은 `prisma migrate dev` 실행 불가 → **마이그레이션 폴더+SQL을 수동 작성** (기존 `prisma/migrations/` 의 vector 마이그레이션 패턴 참고). 적용·검증은 Claude가 수행.
- AI 라이브 호출 0. 테스트는 전부 mock provider (create-test-app 규칙 유지). 라이브 1건 검증은 Claude 담당.
- AI 프롬프트는 **JSON 필드명을 프롬프트에 명시** (generation.prompts.ts 기존 패턴).
- BullMQ jobId 구분자는 `--` (`:` 금지).
- pgvector SQL은 VectorSearchRepository에만 (camelCase 컬럼 쌍따옴표, model 필터 필수).
- GraphQL 스키마 변경 시 schema:emit → codegen은 빌드 체인이 처리. 새 Resolver **클래스**를 만들면 generate-schema.ts에 등록.
- E2E는 slice1·slice3의 내비게이션/신규 확인만 갱신. 기존 label·버튼 텍스트·배지 영문 enum 불변.

---

## Task 1: Prisma — origin 분리 + MediaInsight + MediaAssetEmbedding + BriefReference

**Files:** `prisma/schema.prisma`, `prisma/migrations/<timestamp>_media_origin_brief_reference/migration.sql` (수동 작성)

- [ ] `enum MediaAssetOrigin { MANUAL AD_IMPORT }` 추가. `MediaAsset`에 `origin MediaAssetOrigin @default(MANUAL)` + `@@index([origin])` + `insights MediaInsight[]` + `embeddings MediaAssetEmbedding[]`.
- [ ] `MediaInsight` 모델: id cuid, mediaAssetId(→MediaAsset, onDelete: Cascade), summary String, hookType String, targetAudience String[], emotionalTriggers String[], genres String[], raw Json, provider/model/promptVersion String, createdAt. `@@index([mediaAssetId])` `@@map("media_insights")`.
- [ ] `MediaAssetEmbedding` 모델: CreativeEmbedding(`creative_embeddings`)과 동일 형태 — mediaAssetId(Cascade), model, dimension, `embedding Unsupported("vector(1536)")`, `@@unique([mediaAssetId, model])` `@@map("media_asset_embeddings")`.
- [ ] `enum BriefReferenceMethod { MANUAL SIMILARITY UNKNOWN }` + `BriefReference` 모델: briefId(→CreativeBrief, Cascade), sourceAdId String? (→SourceAd?, onDelete: SetNull), titleSnapshot String?, method BriefReferenceMethod, similarity Float?, rank Int, createdAt. `@@unique([briefId, rank])` `@@index([sourceAdId])`. CreativeBrief에 `references BriefReference[]`, SourceAd에 `briefReferences BriefReference[]`.
- [ ] 마이그레이션 SQL에 **백필 포함**:
  - `UPDATE "MediaAsset" SET "origin" = 'AD_IMPORT' WHERE "id" IN (SELECT DISTINCT "mediaAssetId" FROM "SourceAd" WHERE "mediaAssetId" IS NOT NULL);`
  - BriefReference 백필 (id는 `gen_random_uuid()::text`): `INSERT ... SELECT b."id", ids.val, sa."title", 'UNKNOWN', ids.ord - 1 FROM "CreativeBrief" b CROSS JOIN LATERAL unnest(b."sourceAdIds") WITH ORDINALITY AS ids(val, ord) LEFT JOIN "SourceAd" sa ON sa."id" = ids.val;`
- [ ] `CreativeBrief.sourceAdIds`는 유지 (잡 페이로드·과거 데이터 호환).

## Task 2: 미디어 인사이트 서버 (media 모듈 + creative-analysis 프로세서)

**Files:** `apps/server/src/modules/media/*`, `apps/server/src/queues/creative-analysis.processor.ts`, `apps/server/src/queues/queue.constants.ts`, `apps/server/src/modules/creative-analysis/vector-search.repository.ts`, `apps/server/src/modules/generation/generation.prompts.ts`(또는 media 전용 prompts 파일)

- [ ] `JOB_TYPES.ANALYZE_MEDIA` + jobId 헬퍼 `analyzeMediaJobId(mediaAssetId)` → `analyze-media--{mediaAssetId}`.
- [ ] mutation `analyzeMediaAsset(mediaAssetId: ID!)`: 자산 존재 확인 → `origin !== MANUAL`이면 GraphQLError code `MEDIA_NOT_MANUAL` ('광고 미디어는 광고 탭의 분석을 사용하세요') → OCR/전사 텍스트 없으면 code `TEXT_NOT_EXTRACTED` ('먼저 미디어 텍스트 추출을 실행해주세요') → `JobRecordService.enqueueOrRetry`로 enqueue.
- [ ] 프로세서 케이스: OCR+전사 텍스트 취합 → TEXT_AI 분석 (신규 시스템 프롬프트 — **summary/hookType/targetAudience/emotionalTriggers/genres 필드명을 JSON 구조로 프롬프트에 명시**, promptVersion 등록, zod 스키마 + generateJsonWithRepair) → `MediaInsight` 생성 → embedder.embed(텍스트) → `upsertMediaEmbedding` (repository 신규 메서드). 전 과정 `AiExecutionLogService.record` (배열은 {length} 요약).
- [ ] query `similarAdsForMediaAsset(mediaAssetId: ID!, limit: Int = 5)`: repository 신규 `getMediaEmbeddingVector(mediaAssetId, model)` → 없으면 code `MEDIA_EMBEDDING_NOT_READY` ('인사이트 분석이 끝나면 검색할 수 있습니다') → 기존 `searchSimilar`로 경쟁 광고 검색 (SourceAd 대상, 기존 반환 형태 재사용).
- [ ] query 변경: `mediaAssets(origin: MediaAssetOrigin)` 선택 인자 (미지정 시 전체 — 기존 호환), 단건 `mediaAsset(id: ID!)` (insights 최신순·linkedSourceAds 포함).
- [ ] 유닛 테스트 (mock): 텍스트 미추출 에러 / AD_IMPORT 자산 거부 / 분석 결과 MediaInsight 저장 매핑.

## Task 3: 미디어 웹 — 목록→상세 패턴

**Files:** `apps/web/src/pages/MediaPage.tsx`, `apps/web/src/pages/MediaDetailPage.tsx`(신규), `apps/web/src/App.tsx`, `apps/web/src/lib/page-guides.tsx`

- [ ] 목록: `origin: MANUAL`만 조회. 카드 = 썸네일·파일명·상태 배지·인사이트 유무("인사이트 N개")·"상세 보기 →". 업로드 폼은 상단 유지, 업로드 완료 시 해당 상세로 이동. 페이지 설명·HelpPanel 갱신: "내 시안·참고 미디어를 올려 텍스트를 추출하고 인사이트를 뽑는 곳. 경쟁 광고 수집과 별개 트랙" + 버튼 표(미디어 텍스트 추출 1~2센트 / 인사이트 분석 약 1센트 / 유사 광고 무료).
- [ ] 상세 `/media/:id`: back-link "← 미디어 목록", 미리보기(**URL 마운트 시 고정** — 폴링 재발급 금지, SourceAdDetailPage 패턴), 추출 텍스트 카드, 인사이트 카드(요약·훅·타깃·감정·장르 dl — 광고 상세와 동일 스타일, 영문 enum 병기 규칙 유지), 유사 경쟁 광고 카드(유사도 + /ads/:id 링크), 액션 버튼 3개 data-hint 포함(미디어 텍스트 추출·인사이트 분석·유사 광고) + 잡 폴링.
- [ ] App.tsx 라우트 `/media/:id` (로그인 가드 포함).

## Task 4: 브리프 출처 기록 + 표시

**Files:** `apps/server/src/queues/creative-generation.processor.ts`, `apps/server/src/modules/generation/brief.service.ts`, `brief.models.ts`, `apps/server/src/modules/source-ad/source-ad.service.ts`, `apps/web/src/pages/BriefDetailPage.tsx`

- [ ] `resolveSourceAdIds` → 참조 메타 반환으로 변경: 직접 지정 = `{ sourceAdId, method: MANUAL, similarity: null }`, RAG 검색 = `{ sourceAdId, method: SIMILARITY, similarity: hit.similarity }` (rank = 배열 순서). brief create 시 `references` createMany + `titleSnapshot`(당시 SourceAd.title). `sourceAdIds`도 기존대로 채움.
- [ ] brief.service: `references` include(sourceAd select id·title) → GraphQL `BriefReferenceModel { sourceAdId, title, method, similarity, deleted }` — title은 살아있는 광고면 현재 제목, 삭제면 titleSnapshot, deleted = sourceAd null 여부. 기존 `referencedAds` 필드는 `references`로 교체 (웹 쿼리 함께 갱신).
- [ ] source-ad.service `referencingBriefs`: sourceAdIds 배열 스캔 → `BriefReference` 조회 기반으로 교체.
- [ ] BriefDetailPage "이 브리프가 참고한 것" 카드 (기존 "참조한 경쟁 광고" 카드 대체):
  - 입력 포커스: focusText (없으면 생략)
  - 브랜드: 링크(/brands/:id) 또는 "기본 컨텍스트 (BabeChat · 대만)"
  - 참조 경쟁 광고: 제목 링크(/ads/:id) + 배지 — `자동 검색 · 유사도 0.83` / `직접 지정` / `기록 없음`(UNKNOWN). 삭제된 광고는 링크 없이 "제목 (삭제됨)".
  - 성과 환류: raw.performanceContext 있으면 추적코드·기준 문구 표시
  - AI 정보: provider · model · promptVersion (muted 소형 텍스트)
- [ ] 유닛 테스트: RAG 경로에서 references 저장(method/similarity/rank) / 삭제된 광고 title 스냅샷 폴백 매핑.

## Task 5: E2E 갱신 (slice1·slice3만)

- [ ] slice1: 업로드 → 목록 카드 "상세 보기 →" → 상세에서 기존 텍스트 추출 확인([MOCK OCR] 등 기존 mock 문자열 유지) → "인사이트 분석" 클릭 → mock 인사이트 요약 표시 확인 (mock TEXT_AI 결정적 출력값을 구현 후 확정해 assert).
- [ ] slice3: 브리프 상세에 출처 카드 — 참조 광고 1건 이상 + "자동 검색" 배지 표시 확인 (RAG-{stamp} 광고 제목 매칭).
- [ ] 합격선: `pnpm e2e` 전체 통과. 다른 slice는 수정 금지.

## Task 6: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] migrate dev 적용, build + 서버 테스트 + e2e
- [ ] 브라우저 순회 + 라이브 1건 (수동 미디어 1건 텍스트 추출 + 인사이트 분석, ~2센트) + 브리프 출처 카드 확인
- [ ] 커밋

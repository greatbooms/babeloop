# 비주얼 묘사 — 글자 없는 이미지 광고도 분석 가능하게

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** 텍스트 추출(process-media) 단계에서 OCR·전사와 함께 **비주얼 묘사**(장면·캐릭터·스타일·비주얼 훅을 서술한 한국어 텍스트)를 비전 LLM으로 생성해 저장한다. 이미지 광고는 원본, 영상 광고는 썸네일로 생성. 이 묘사가 광고 분석·임베딩의 재료에 합류해 **글자 없는 일러스트 광고도 분석·유사 검색이 가능**해진다.

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가(SQL 수동 작성). AI 라이브 호출 0 — mock으로만.
- **Playwright e2e 6종 무수정 통과** — slice1이 '[MOCK OCR]' 문자열을 단언한다: 기존 mock 출력 불변, 신규 mock 문자열은 '[MOCK 비주얼]' 접두로 추가만.
- 서버 포트 16000. i18n(ko+zhTw). enqueueOrRetry·AiExecutionLog(비용 포함) 유지.
- 추출의 교체 의미론 유지: 재추출 시 기존 비주얼 묘사도 $transaction 안에서 함께 교체.

---

## Task 1: 스키마 + 비전 묘사 생성

**Files:** `prisma/schema.prisma` + `prisma/migrations/20260813090000_visual_descriptions/migration.sql`(신규), OCR 프로바이더(`apps/server/src/providers/ocr/*`) 확장, `apps/server/src/queues/media-processing.processor.ts`(추출 잡 위치 확인 후)

- [ ] `VisualDescription` 모델: id cuid, mediaAssetId(→MediaAsset, Cascade), text, provider, model, promptVersion, createdAt. `@@index([mediaAssetId])` `@@map("visual_descriptions")`. MediaAsset에 `visualDescriptions VisualDescription[]`.
- [ ] 마이그레이션 SQL 수동 작성(CREATE TABLE + FK + index).
- [ ] OCR 프로바이더 인터페이스에 `describe(input: { buffer: Buffer; contentType: string }): Promise<{ text: string; usage?... }>` 추가 —
  openai: 비전 모델(gpt-5.6-terra vision 경로, OCR과 동일한 호출 방식)에 프롬프트: "이 광고 이미지를 마케팅 분석용으로 묘사하라: 장면·등장 캐릭터(외형·스타일)·아트 스타일·색감·구도·비주얼 훅(시선을 끄는 요소)·전달하는 분위기. 한국어 4~6문장." promptVersion `describe-visual@v1`.
  mock: `[MOCK 비주얼] 광고 이미지 묘사` 반환(결정적).
- [ ] 추출 잡(process-media): IMAGE는 원본 버퍼, VIDEO는 썸네일(thumbnailKey 있으면)로 describe 호출 → VisualDescription 저장. OCR·전사와 같은 $transaction 교체 의미론에 포함. AiExecutionLog 기록(추정 비용 포함 — 이미지 입력 토큰 기준 대략 1센트).
- [ ] 유닛 테스트: mock describe 저장 1건.

## Task 2: 분석·임베딩 재료 합류

**Files:** 분석 프로세서(analyze-creative 조립부), 임베딩 입력 조립부, `source-ad.service.ts`의 hasText 가드

- [ ] 분석 입력 텍스트에 `## 비주얼 묘사` 섹션 추가(있을 때). analyze 가드: adText·OCR·전사·**비주얼 묘사** 중 하나라도 있으면 통과 — 에러 문구를 '분석할 재료가 없습니다 — 문구 입력 또는 텍스트 추출(비주얼 묘사 포함)이 필요합니다'로 갱신.
- [ ] 임베딩 입력에도 비주얼 묘사 포함(광고문구+OCR+전사+비주얼 — 제목 제외 원칙 유지).
- [ ] analyze-creative promptVersion v2→v3 갱신 및 관련 유닛/통합 테스트 단언 갱신(의도된 변경).

## Task 3: UI 노출

**Files:** `apps/web/src/pages/SourceAdDetailPage.tsx`, `MediaDetailPage.tsx`(미디어 트랙도 동일 노출), `messages.ts`, `full-guide.ts`(2단계 설명 한 줄), 광고·미디어의 추출 비용 힌트 문구(+1센트 반영)

- [ ] 추출 텍스트 카드에 「비주얼 묘사」 섹션(OCR·전사와 나란히). 없으면 표시 안 함.
- [ ] 추출 버튼 힌트: '이미지 글자·영상 음성 추출 + 비주얼 묘사 생성 (AI, 건당 2~3센트)'로 갱신(ko+zh, 재추출 확인창 문구도).
- [ ] i18n ko+zhTw.

## Task 4: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용(dev+나스는 배포 시 자동), build·서버 테스트·e2e 6종 무수정
- [ ] 라이브 1건: 나스의 케이브덕 광고(글자 없는 일러스트) 재추출 → 비주얼 묘사 생성 → 분석 성공 확인 (~2-3센트)
- [ ] 커밋·배포

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

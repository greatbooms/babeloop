# 문구 반영 방식 토글 — 장면에 반영 vs 글자로만 삽입

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** 검토 이미지 생성에서 광고 문구가 이미지에 관여하는 방식을 선택한다. ① **SCENE**(기본, 현재 동작): 문구가 말하는 순간을 장면으로 연출 — 프롬프트에 문구 섹션 포함. ② **TEXT_ONLY**(신규): 문구 내용을 장면 연출에서 완전히 제외 — 이미지는 브리프 맥락·참고 이미지(캐릭터·화풍)·추가 요구사항만으로 생성되고, 문구는 글자로만 삽입(서버 합성 또는 AI 타이포). 참고 이미지의 캐릭터·배경 기반으로 만들고 문구는 폰트만 입혀 얹는 워크플로를 지원한다.

**전제 사실:**
- 이미지 프롬프트는 v6 영어 스캐폴드(`generation.prompts.ts` buildImagePrompt). 문구 관여 섹션은 `## Approved ad copy (the image must depict the moment this copy describes)`.
- AI 타이포 모드의 `## Text to render inside the image` 섹션은 **글자 렌더링 지시**라 TEXT_ONLY에서도 유지된다(문구를 그리는 것 자체는 목적). 서버 합성 모드는 프롬프트에 문구가 아예 안 들어가고 생성 후 합성.
- 재생성 승계 패턴(규격·문구·폰트·색상·참조 역할과 동일)에 합류.

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가(SQL 수동 작성). **AI 라이브 호출 0** — mock으로만.
- **Playwright e2e 6종 무수정 통과** — 기본값 SCENE에서 기존 흐름·프롬프트 완전 동일.
- i18n ko+zhTw 전 키. promptVersion v6 유지(프롬프트 전문이 저장되므로 추적 가능).

---

## Task 1: 입력·스키마·프롬프트 분기

**Files:** `prisma/schema.prisma` + `prisma/migrations/20260815180000_copy_influence/migration.sql`(신규), `apps/server/src/modules/generation/brief.inputs.ts`·`brief.service.ts`·`brief.models.ts`·`generation.prompts.ts`, `apps/server/src/queues/creative-generation.processor.ts`, 관련 spec

- [ ] GraphQL enum `CopyInfluence { SCENE TEXT_ONLY }`. `GenerateCreativeImagesInput`에 `copyInfluence?: CopyInfluence`(기본 SCENE) 추가. TEXT_ONLY 검증 없음(문구 없이도 허용 — 문구 없으면 사실상 참조 기반 클린 생성).
- [ ] GeneratedImage에 `copyInfluence String?` 추가. SQL: `ALTER TABLE "generated_images" ADD COLUMN "copyInfluence" TEXT;` (null=기존=SCENE).
- [ ] `buildImagePrompt`에 `copyInfluence` 파라미터: TEXT_ONLY면 ① `## Approved ad copy` 섹션 생략 ② intro 직후에 한 줄 추가: `Do NOT derive the scene from any ad copy. Build the scene only from the strategy context, references and user requirement below. Reserve clean space for a text overlay that will be added separately.` (AI 타이포 모드면 마지막 문장 대신 `The only text in the image must be the text specified in the "Text to render" section below.`)
- [ ] 잡 payload에 copyInfluence 전달, 프로세서에서 buildImagePrompt에 반영, 저장 시 기록. 검토 상세 images 모델에 노출.
- [ ] 유닛: TEXT_ONLY 프롬프트에 문구 미포함+제외 지시 포함 1건, SCENE 기본 동작 불변 1건, AI 타이포+TEXT_ONLY 조합 1건.

## Task 2: 검토 UI

**Files:** `apps/web/src/pages/ReviewDetailPage.tsx`, `apps/web/src/i18n/messages.ts`, `full-guide.ts`(한 줄), `review.css`(필요시)

- [ ] 「이미지에 넣을 문구」 섹션의 렌더 방식 라디오 아래에 「문구 반영」 라디오: 「문구 내용을 장면에 반영 (기본)」 / 「문구는 글자로만 삽입」 + 힌트 `글자로만 삽입: 이미지는 참고 이미지·추가 요구사항 위주로 만들어지고 문구는 얹기만 합니다`.
- [ ] headline이 비어 있으면 이 라디오 숨김(기존 옵션들과 동일 조건).
- [ ] 뮤테이션 input에 copyInfluence 전달. 캡션에 「글자만 삽입」 태그(TEXT_ONLY일 때). 「이 요구사항으로 다시 생성」 승계.
- [ ] i18n ko+zhTw 전 키.

## Task 3: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용(dev), build·서버 전체 테스트·e2e 6종 무수정, mock 브라우저(라디오·승계·캡션)
- [ ] 라이브 1건: 캐릭터+화풍 참조 & TEXT_ONLY & 서버 합성 문구 — 장면이 문구 내용과 무관하게 참조 기반으로 나오는지 실측 (~$0.04)
- [ ] 커밋·배포(main 푸시=나스 자동)

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

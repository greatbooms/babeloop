# 참조 역할 분리(캐릭터·화풍·폰트) + 이미지 프롬프트 영문화

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** ① 검토 이미지 생성의 참고 이미지마다 **용도(역할)**를 명시 선택한다 — 캐릭터(이 캐릭터 그대로 출연) / 화풍(스타일·색감만) / 폰트(타이포그래피만). 역할별로 프롬프트 지시가 달라진다. ② 이미지 생성 프롬프트의 **고정 스캐폴드를 영어로 전면 재작성**한다 — 이미지 모델의 지시 이행 정확도가 영어에서 더 높다. 광고 문구(한국어·zh-TW 원문)와 사용자가 한글로 쓰는 추가 요구사항은 원문 그대로 두되 영어 프레임으로 감싼다.

**전제 사실:**
- 참조 전송은 gpt-image-1 `images/edits`(input_fidelity high), 첨부 배열 순서가 있다 — 프롬프트에서 "attached reference image #N"으로 지칭 가능.
- 직전 커밋에서 한국어 유지 지시(appendReferenceImages)가 들어갔다 — 이번에 역할별 영어 지시로 대체된다.
- 운영 실측: 유지 지시 없던 시절 캐릭터가 다른 인물로 생성됨. 역할 미분리 상태에선 완성 광고(텍스트 포함)를 캐릭터 참조로 쓰면 노이즈.

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가(SQL 수동 작성). **AI 라이브 호출 0** — mock으로만.
- **Playwright e2e 6종 무수정 통과** — 참조 미선택 기본 흐름은 완전히 동일해야 한다.
- i18n ko+zhTw 전 키. 재생성 승계 패턴(규격·문구·폰트·색상과 동일)에 역할 합류.

---

## Task 1: 스키마·입력·잡 payload

**Files:** `prisma/schema.prisma` + `prisma/migrations/20260815120000_reference_roles/migration.sql`(신규), `apps/server/src/modules/generation/brief.inputs.ts`·`brief.service.ts`·`brief.models.ts`, `apps/server/src/queues/creative-generation.processor.ts`, 관련 spec

- [ ] GraphQL enum `GenerationReferenceRole { CHARACTER STYLE TYPOGRAPHY }`. `GenerationReferenceInput`에 `role: GenerationReferenceRole`(기본 STYLE) 추가.
- [ ] GeneratedImage에 `referenceRolesJson Json?` 추가 — `[{ "key": string, "role": "CHARACTER"|"STYLE"|"TYPOGRAPHY" }]`. SQL: `ALTER TABLE "generated_images" ADD COLUMN "referenceRolesJson" JSONB;` (referenceKeys는 호환용 유지, 같은 순서).
- [ ] 참조 해석(resolveGenerationReferences)이 `{ key, role }[]` 반환. **정렬: CHARACTER → STYLE → TYPOGRAPHY 순으로 첨부** (첨부 순서=프롬프트 서술 순서를 안정시킨다).
- [ ] 잡 payload `references: [{ key, role }]` (기존 referenceKeys 병행 기록). 프로세서는 순서대로 버퍼 로드, 저장 시 referenceRolesJson 기록.
- [ ] 검토 상세 images 모델에 referenceRolesJson(또는 파싱된 `references { key role }`) 노출.
- [ ] 유닛: 역할 정렬·저장 1건, 기본 STYLE 1건.

## Task 2: 프롬프트 영문화 + 역할별 참조 지시

**Files:** `apps/server/src/modules/generation/generation.prompts.ts`(+spec), `apps/server/src/modules/generation/image-size-presets.ts`(GROUP_PROMPTS 영문화), `apps/server/src/queues/creative-generation.processor.ts`

- [ ] `buildImagePrompt` 고정 스캐폴드 전면 영어화 (promptVersion `generate-copy-images@v6`, 참조·AI타이포 유무 무관 v6):
  - intro: `Create {n} ad image draft(s) for a mobile feed ad. Render the brief below as one concrete moment and scene — not abstract concepts. Expression, hands, device screens and the space itself must tell the story.`
  - 섹션 헤더 영어(`## Product`, `## Ad strategy`, `## Approved ad copy (the image must depict the moment this copy describes)` 등). **브랜드 설명·전략·문구 값은 원문 그대로**(한국어/중문) 인용.
  - 연출 지침 → `## Art direction` 영어로: 구체적 조명·색·질감 지정, 성인 인물(20+), 대만 도시 맥락, 일반화된 채팅 UI.
  - 금지 → `## Prohibited`: no text/letters/logos/watermarks unless explicitly instructed below; no minors or school settings; no distorted hands/anatomy.
  - AI 타이포 섹션 → 영어 (`## Text to render inside the image (exactly these characters, with accurate Traditional Chinese strokes)` + 문구 원문 그대로 + 스타일 지시 영어).
  - 규격 섹션(GROUP_PROMPTS 포함) → 영어 (`## Output format: 1200x628 (1.91:1) — generated at native 1536x1024 then center-cropped; keep faces and key objects away from the edges.` 등).
  - 사용자 추가 요구사항: `## User requirement (may be written in Korean — follow it precisely; it overrides any conflicting direction above)\n{원문}`.
- [ ] `appendReferenceImages` → `appendReferences(prompt, references: {key, role}[])`로 교체, 역할별 영어 지시:
  - 공통 도입: `## Attached reference images ({n})\nReferences are attached in the order listed. Use each ONLY for its stated purpose.`
  - CHARACTER: `Reference #{i} — CHARACTER: Put this exact character into the new scene. Preserve identical facial features, hairstyle and length, eye color, body type and overall art finish so it reads as the same person. Do not copy this image's composition or any text in it.`
  - STYLE: `Reference #{i} — STYLE: Match this image's art style, rendering finish, color palette and mood only. Do not copy its characters, composition or text.`
  - TYPOGRAPHY: `Reference #{i} — TYPOGRAPHY: Match only the typography feel (typeface style, weight, arrangement) of the text in this image. Do not copy the actual words, characters or logos.`
  - 끝에 키 목록(추적용) 유지.
- [ ] CHARACTER 참조가 있으면 art-direction과 충돌 시 참조 우선 문장: `When any CHARACTER or STYLE reference conflicts with the art direction above, the reference wins (including realism vs. anime).`
- [ ] 유닛: v6 영어 스캐폴드 스냅샷성 단언(핵심 문장 포함 여부), 역할별 지시 생성 1건씩, 사용자 요구사항 원문 보존 1건.

## Task 3: 검토 UI — 역할 선택

**Files:** `apps/web/src/pages/ReviewDetailPage.tsx`, `review.css`, `apps/web/src/i18n/messages.ts`, `full-guide.ts`(한 줄)

- [ ] 참고 이미지 썸네일 선택 시 기본 역할 STYLE. **선택된 썸네일에 역할 칩 3개(캐릭터/화풍/폰트)** 노출 — 클릭으로 역할 교체(단일 선택). 선택 안 된 썸네일엔 칩 없음.
- [ ] 상단 요약: `선택 {n}/16 · 캐릭터 {c} · 화풍 {s} · 폰트 {t}` 형식으로 역할 구성 표시.
- [ ] 뮤테이션 input references에 role 포함. 「이 요구사항으로 다시 생성」 → 역할까지 승계(referenceRolesJson 기반).
- [ ] 생성물 캡션의 참고 표시를 `참고 3장 (캐릭터 1·화풍 2)` 형식으로.
- [ ] AI 타이포 모드의 「참고 이미지와 비슷하게」(match_reference)는 TYPOGRAPHY 역할 참조가 있을 때만 활성(없으면 비활성+힌트).
- [ ] i18n ko+zhTw 전 키.

## Task 4: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용(dev), build·서버 전체 테스트·e2e 6종 무수정, mock 브라우저(역할 칩·요약·승계)
- [ ] 라이브 1건: 캐릭터 참조(단독 캐릭터 이미지) + 화풍 참조(戰場 광고) + 폰트 참조 조합으로 캐릭터 유지 실측 (~$0.04)
- [ ] 커밋·배포(main 푸시=나스 자동)

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

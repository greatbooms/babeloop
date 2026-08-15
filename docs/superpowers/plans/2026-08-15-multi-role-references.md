# 참조 역할 복수 선택 — 한 이미지에 캐릭터+화풍+폰트 동시 지정

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** 참고 이미지의 역할을 단일 선택에서 **복수 선택(토글)**으로 확장한다. 같은 이미지에 CHARACTER+STYLE+TYPOGRAPHY를 조합 지정하면 프롬프트에 결합 지시가 나간다.

**전제 사실:**
- 현재 `GenerationReferenceInput.role`(단일, 기본 STYLE), `referenceRolesJson`은 `[{key, role}]`, 역할별 영어 지시는 `generation.prompts.ts`의 appendReferences에 있음. UI는 선택 썸네일에 칩 3개 단일 선택.
- 정렬 규칙: CHARACTER → STYLE → TYPOGRAPHY 순 첨부.

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가(이번엔 스키마 변경 없음 — referenceRolesJson은 JSONB라 형태만 확장). **AI 라이브 호출 0** — mock으로만.
- **Playwright e2e 6종 무수정 통과.** 기존 단일 role 입력과의 하위 호환 유지.
- i18n ko+zhTw. 재생성 승계 유지.

---

## Task 1: 입력·프롬프트 결합 지시

**Files:** `apps/server/src/modules/generation/brief.inputs.ts`·`brief.service.ts`, `apps/server/src/modules/generation/generation.prompts.ts`, `apps/server/src/queues/creative-generation.processor.ts`, 관련 spec

- [ ] `GenerationReferenceInput`에 `roles: [GenerationReferenceRole!]`(선택) 추가 — 있으면 우선, 없으면 `[role ?? STYLE]`. 중복 제거, 빈 배열 거부(BAD_USER_INPUT).
- [ ] 해석 결과를 `{ key, roles: Role[] }`로 확장. `referenceRolesJson`은 `[{key, roles: [...]}]` 형태로 저장하되 **읽기 하위 호환**: 기존 `{key, role}` 항목은 `[role]`로 해석(재생성 승계·캡션에서 사용되는 곳 전부).
- [ ] 정렬: CHARACTER 포함 → STYLE 포함 → TYPOGRAPHY 순(포함 우선순위 기준).
- [ ] appendReferences 결합 지시: 역할 조합별로 문장 조립 —
  - 헤더: `Reference #{i} — {CHARACTER + STYLE 처럼 + 조인}:`
  - CHARACTER 포함: `Put this exact character into the new scene. Preserve identical facial features, hairstyle and length, eye color, body type and overall art finish so it reads as the same person.`
  - STYLE 포함: `Match this image's art style, rendering finish, color palette and mood.`
  - TYPOGRAPHY 포함: `Match the typography feel (typeface style, weight, arrangement) of the text in this image.`
  - 금지 꼬리(조합에 맞게 한 문장): 텍스트 내용·로고 복사 금지는 항상, `composition` 복사 금지는 CHARACTER/STYLE 단독일 때 유지, `characters` 복사 금지는 CHARACTER 미포함일 때만.
- [ ] AI 타이포 match_reference 게이트: roles에 TYPOGRAPHY가 포함된 참조가 하나라도 있으면 허용.
- [ ] 유닛: 3역할 결합 지시 1건, 하위 호환(단일 role) 1건, 빈 roles 거부 1건, 정렬 1건.

## Task 2: 검토 UI — 칩 복수 토글

**Files:** `apps/web/src/pages/ReviewDetailPage.tsx`, `review.css`(필요시), `apps/web/src/i18n/messages.ts`, `full-guide.ts`(한 줄)

- [ ] 역할 칩을 다중 토글로: 클릭 시 켜고 끔, 최소 1개 유지(마지막 하나를 끄려 하면 무시하거나 STYLE로 복귀 — 후자 채택). 시각적으로 선택된 칩 복수 강조.
- [ ] 요약 카운트는 역할 포함 기준(`캐릭터 {c} · 화풍 {s} · 폰트 {t}` — 한 이미지가 여러 카운트에 중복 포함 가능).
- [ ] 뮤테이션 input에 `roles` 배열 전달(단일 `role` 필드는 더 이상 보내지 않음). 재생성 승계는 `referenceRolesJson`의 roles 배열 그대로.
- [ ] 캡션 `참고 N장 (캐릭터 c·화풍 s·폰트 t)` 유지. i18n ko+zhTw(변경 필요한 키만).

## Task 3: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] build·서버 전체 테스트·e2e 6종 무수정, mock 브라우저(복수 토글·승계)
- [ ] 라이브 1건: 한 이미지에 캐릭터+화풍(+폰트) 동시 지정 실측 (~$0.04)
- [ ] 커밋·배포(main 푸시=나스 자동)

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

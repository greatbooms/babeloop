# 캐릭터 원본 합성 — 누끼 + 배경만 생성 + 서버 합성

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** 검토 이미지 생성에 「캐릭터 원본 합성」 모드를 추가한다. AI가 캐릭터를 다시 그리는 대신 ① 캐릭터 역할 참조에서 캐릭터를 **누끼**(알파 있으면 무손실 사용, 없으면 gpt-image-1 투명 출력으로 1회 분리 후 **파생 자산으로 저장·재사용**) ② 배경만 원하는 규격으로 AI 생성(인물 금지) ③ 서버가 누끼를 위치·크기대로 픽셀 그대로 합성 → 기존 문구 합성으로 이어진다. 눈동자 색 등 미세 속성이 원본과 100% 동일해지는 것이 목적.

**전제 사실:**
- 합성·픽셀 검사는 @napi-rs/canvas(`text-overlay.ts` 패턴). PNG/WebP 알파 존재 여부는 loadImage→getImageData로 판별 가능.
- gpt-image-1은 `background: 'transparent'` 파라미터 지원(generate·edit). 분리 프롬프트로 edit(input_fidelity high, quality high) 호출 시 투명 배경 캐릭터 PNG가 나온다 — 재드로잉이므로 알파 소스보다 충실도 낮음(사용자 인지됨).
- 누끼 캐시: 파생 자산 키 `cutouts/{mediaAssetId 또는 generatedImageId}/{hash}.png`로 storage에 저장, 같은 소스 재요청 시 재사용(비용 0). 매핑은 신규 테이블 없이 storage 키 규칙+HeadObject 존재 확인으로.
- 규격·리사이즈·문구 합성 파이프라인은 기존 것 재사용. 캐릭터 합성은 리사이즈 후·문구 합성 전에 수행.

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). prisma migrate 실행 불가(SQL 수동 작성). **배포·라이브 AI 호출 금지**(mock으로만 — 라이브 실측·배포는 사용자 요청 시 Claude).
- **Playwright e2e 6종 무수정 통과** — 모드 미사용 기본 흐름 완전 동일.
- i18n ko+zhTw 전 키. 재생성 승계에 합성 설정 포함. 비용 규칙: 누끼 분리가 필요한 경우 모달에 1회 비용(~$0.19)과 "저장 후 재사용" 안내 표시.

---

## Task 1: 서버 — 누끼 획득·배경 생성 프롬프트·합성 파이프라인

**Files:** `prisma/schema.prisma` + `prisma/migrations/20260820090000_character_composite/migration.sql`(신규), `apps/server/src/common/media/character-composite.ts`(신규+spec), `apps/server/src/providers/image/*`(background/transparent 지원), `apps/server/src/modules/generation/brief.inputs.ts`·`brief.service.ts`·`generation.prompts.ts`, `apps/server/src/queues/creative-generation.processor.ts`, 관련 spec

- [ ] GeneratedImage에 `characterCompositeJson Json?` 추가 — `{ sourceKey, cutoutKey, position: 'LEFT'|'CENTER'|'RIGHT', heightRatio: number }`. SQL 수동 작성.
- [ ] `GenerateCreativeImagesInput`에 `characterComposite?: { referenceIndex?: number(기본: CHARACTER 역할 첫 참조); position?: 'LEFT'|'CENTER'|'RIGHT'(기본 RIGHT); heightRatio?: number(0.4~1.0, 기본 0.9) }` — CHARACTER 역할 참조가 없으면 BAD_USER_INPUT.
- [ ] 프로바이더: `ImageGenerationInput`에 `transparentBackground?: boolean` 추가 → openai generate/edit에 `background: 'transparent'` 전달. mock은 기존 PNG 반환.
- [ ] `character-composite.ts`:
  - `hasAlphaChannel(buffer)`: 다운스케일 후 getImageData로 alpha<255 픽셀 존재 검사.
  - `obtainCutout({ sourceBuffer, sourceKey, storage, imageAi, aiLog })`: 캐시 키 존재 시 로드 → 알파 있으면 소스 그대로 저장·반환 → 없으면 imageAi.generate({ prompt: 분리 전용 영어 프롬프트('Extract ONLY the character exactly as drawn — identical colors, lines and details. Output on a fully transparent background. Do not add, remove or restyle anything.'), referenceImages:[source], transparentBackground: true, quality: 'high', count: 1 }) → 캐시 저장(AI 로그 기록, promptVersion `character-cutout@v1`).
  - `compositeCharacter(background, cutout, { position, heightRatio })`: canvas로 누끼를 배경 높이×ratio로 등비 축소, 하단 정렬, 좌/중/우 배치(여백 4%), 합성 PNG 반환.
- [ ] 프로세서: characterComposite 있으면 ① 배경 프롬프트로 전환 — 장면 프롬프트에 `## Background only\nDo NOT draw any person or character — they will be composited separately. Leave the {position} side open for the character.` 병기, CHARACTER 역할 참조는 첨부에서 제외(화풍·폰트 역할만 첨부) ② 생성→리사이즈 후 obtainCutout→compositeCharacter ③ 문구 합성은 그 위에 기존대로 ④ characterCompositeJson·cutoutKey 저장. 누끼 분리 비용은 AI 로그로 자연 합산.
- [ ] 유닛: 알파 소스 무손실 경로 1건, 캐시 재사용(2회째 AI 미호출) 1건, 합성 위치·비율 1건, CHARACTER 참조 없이 요청 거부 1건, 배경 프롬프트에 인물 금지 병기 1건.

## Task 2: 검토 UI

**Files:** `apps/web/src/pages/ReviewDetailPage.tsx`, `review.css`, `apps/web/src/i18n/messages.ts`, `full-guide.ts`(한 줄)

- [ ] 캐릭터 역할 참조가 1개 이상 선택되면 참고 섹션 아래 「캐릭터 원본 합성」 토글 노출: 켜면 위치(좌/중/우 라디오)·크기(40~100% 슬라이더, 기본 90%) + 안내 `캐릭터를 다시 그리지 않고 참조 원본을 그대로 오려 배치합니다. 투명 배경 PNG면 무손실, 아니면 최초 1회 AI 분리(~$0.19) 후 저장해 재사용합니다`.
- [ ] 켜면 렌더 방식은 「정확한 글자 합성」으로 고정(AI 타이포 비활성+사유 힌트 — 배경만 생성 모드라 AI가 글자 그릴 장면 통제가 없음).
- [ ] 뮤테이션 input 전달, 시안 캡션에 「원본 합성」 태그, 재생성 승계(characterCompositeJson 기반).
- [ ] i18n ko+zhTw 전 키.

## Task 3: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] 마이그레이션 적용(dev), build·서버 전체 테스트·e2e 6종 무수정, mock 브라우저(토글·위치·슬라이더·승계)
- [ ] 커밋(로컬). 라이브 실측·배포는 사용자 요청 시.

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

# 문구 섹션 UX 개선 — 방식 설명·접이식 폰트·색상 자동 추출

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** 이미지 생성 모달 「이미지에 넣을 문구」 UX 3종 개선. ① 렌더 방식 라디오를 설명 딸린 카드형으로 명확화 ② 폰트 선택을 모드별로 경량화 — 서버 합성은 접이식(선택 폰트 1개 미리보기 + 펼치기), AI 모드는 그리드 숨기고 계열 드롭다운 ③ 색상을 3고정에서 확장 — 「참조에서 자동 추출」(서버 합성은 참조 픽셀에서 대표 강조색 실제 추출, AI는 지시 전달) + 직접 색 선택(컬러 피커).

**전제 사실:**
- 합성은 @napi-rs/canvas(`text-overlay.ts`) — 픽셀 접근 가능(createCanvas→drawImage→getImageData).
- 현재 OVERLAY_COLORS = white/black/gold(fill+shadow). overlayColor는 GeneratedImage에 문자열 저장, 캡션·재생성 승계에 사용.
- 참조는 `references: [{key, roles}]`로 프로세서에 전달되고 버퍼 로드 로직 존재. TYPOGRAPHY 역할 참조가 색 추출 1순위.
- AI 타이포 스타일 지시는 `buildAiTypographyStyle`(generation.prompts.ts).

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). **배포·라이브 AI 호출 금지**(mock으로만 — 배포와 라이브 실측은 사용자 요청 시 Claude가 진행). prisma migrate 실행 불가(이번엔 스키마 변경 없음 — overlayColor 문자열에 'auto'/'#rrggbb'를 그대로 저장).
- **Playwright e2e 6종 무수정 통과** — 기본값(서버 합성·gothic·white)에서 기존 흐름 완전 동일.
- i18n ko+zhTw 전 키. 재생성 승계(방식·폰트·색상) 유지 — 'auto'/'#hex'도 승계.

---

## Task 1: 서버 — 색상 자동 추출·커스텀 hex

**Files:** `apps/server/src/common/media/text-overlay.ts`(+spec), `apps/server/src/modules/generation/brief.service.ts`, `apps/server/src/queues/creative-generation.processor.ts`, `apps/server/src/modules/generation/generation.prompts.ts`, 관련 spec

- [ ] `extractAccentColor(buffer: Buffer): Promise<{ fill: string; shadow: string }>` (text-overlay.ts):
  이미지를 64×64로 다운스케일해 getImageData → RGB→HSV 변환 → 채도 ≥ 0.35, 명도 0.35~0.95 픽셀만 히스토그램(색상 30도 버킷) → 최다 버킷의 평균색을 fill로. 유효 픽셀이 전체의 2% 미만이면 흰색 폴백. shadow는 fill 상대 명도 > 0.6이면 'rgba(0,0,0,0.6)' 아니면 'rgba(255,255,255,0.35)'.
- [ ] overlayColor 검증 확장(brief.service): 기존 키 3종 + `'auto'` + `/^#[0-9a-fA-F]{6}$/`. 그 외 BAD_USER_INPUT.
- [ ] `resolveOverlayColor(color, opts)` 헬퍼(text-overlay.ts): 키 3종→OVERLAY_COLORS, hex→{fill: hex, shadow: 명도 규칙}, 'auto'→ null 반환(호출부가 추출 수행).
- [ ] 프로세서 서버 합성 경로: color==='auto'면 TYPOGRAPHY 역할 참조 버퍼(없으면 첫 참조, 그것도 없으면 리사이즈된 클린 이미지 버퍼)로 extractAccentColor → 합성. 저장 overlayColor는 'auto' 그대로(재생성 승계용).
- [ ] AI 모드 색 지시(buildAiTypographyStyle): 'auto'→'a text color that matches the reference typography or the image mood', hex→`color ${hex}`, 키 3종→기존.
- [ ] 유닛: 단색+강조색 합성 PNG로 추출 검증 1건(예: 회색 배경에 금색 블록 → 금색 계열 반환), 폴백 1건, hex 검증 거부 1건, auto 승계 저장 1건.

## Task 2: 검토 UI — 카드형 방식·접이식 폰트·색상 확장

**Files:** `apps/web/src/pages/ReviewDetailPage.tsx`, `apps/web/src/lib/overlay-options.ts`, `review.css`, `apps/web/src/i18n/messages.ts`, `full-guide.ts`(한 줄)

- [ ] 렌더 방식 라디오 → 카드형(제목+한 줄 설명, 선택 강조):
  - 「정확한 글자 합성 (권장)」 / 설명 `이미지를 만든 뒤 선택한 폰트로 문구를 얹습니다 — 글자가 깨지지 않습니다`
  - 「AI가 글자까지 그리기 (실험적)」 / 설명 `문구를 그림의 일부로 그립니다 — 스타일은 자유롭지만 한자가 깨질 수 있습니다` (기존 경고문은 이 설명으로 흡수, 별도 노란 배너 제거)
- [ ] **서버 합성 모드 폰트**: 기본 접힘 — 선택된 폰트 미리보기 카드 1개 + 「다른 폰트 보기」 버튼, 클릭 시 7종 그리드 펼침(선택하면 다시 접힘). 미리보기 텍스트·색 반영 기존 유지.
- [ ] **AI 모드 폰트**: 그리드·미리보기 숨김. 타이포 스타일 라디오 재구성 —
  「선택한 폰트 계열로」(계열 드롭다운: 7종 이름만) / 「참고 이미지와 비슷하게」(TYPOGRAPHY 참조 있을 때만) / 「이미지에 어울리게 자동」.
- [ ] **색상 row**(양 모드 공통): 스와치 흰/검/골드 + 「참조에서 자동」 칩(참조 선택 시만 활성, 서버 모드에선 참조 없으면 '생성 이미지에서 추출' 툴팁) + 컬러 피커(input type=color, 선택 시 스와치 해제·hex 전달). 미리보기 카드: auto면 색 안내 배지(`참조에서 추출됨`), hex면 그 색 반영.
- [ ] 캡션: 색상 표기를 'auto'→'자동', hex→스와치 점+hex로. 재생성 승계에 auto/hex 포함.
- [ ] i18n ko+zhTw 전 키.

## Task 3: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] build·서버 전체 테스트·e2e 6종 무수정, mock 브라우저(카드형 라디오·접이식 폰트·AI 모드 경량 UI·색상 row·승계)
- [ ] 커밋(로컬). 배포·라이브 실측은 사용자 요청 시.

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

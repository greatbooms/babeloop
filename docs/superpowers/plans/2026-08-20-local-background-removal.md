# 로컬 배경 제거 — 누끼를 OpenAI 없이 서버에서 직접

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal (사용자 승인 완료):** 캐릭터 원본 합성의 누끼 단계를 OpenAI(안전 필터로 성인향 소재 거부, 운영 실측 2회) 대신 **로컬 ONNX 모델**(애니 특화 IS-Net)로 교체한다. 필터 없음·비용 0·재드로잉 없음(원본 픽셀에 알파만 씌움 — 진짜 무손실 누끼).

**전제 사실:**
- 모델: `isnet-anime.onnx` (~176MB, IS-Net/DIS Apache-2.0, rembg 릴리스 자산으로 배포됨: https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-anime.onnx). GitHub 100MB 제한으로 **레포에 커밋 불가** — Dockerfile에서 빌드 시 다운로드, dev는 Claude가 받아둔다(경로: `models/isnet-anime.onnx`, gitignore).
- 런타임: `onnxruntime-node`(MIT, linux-x64 glibc 프리빌드 — bookworm-slim OK). 전처리·후처리는 @napi-rs/canvas.
- IS-Net 입출력: 입력 1×3×1024×1024 float32(RGB /255 정규화), 출력 1×1×1024×1024 saliency(0~1) → 원본 크기로 리사이즈해 알파로 적용.
- 기존 `obtainCutout`: 알파 있으면 원본 사용 → (변경) 알파 없으면 **로컬 모델로 분리**. OpenAI 분리 경로는 제거. 캐시 키 규칙(`cutouts/...`) 유지.

**환경 제약 (반드시 준수):**
- git 금지(커밋은 Claude). 스키마 변경 없음. **배포·라이브 AI 호출 금지**(mock으로만). 모델 파일 다운로드는 Claude 몫 — Codex는 파일이 없으면 명확한 에러를 내는 코드만 작성하고, 유닛 테스트는 추론 래퍼를 mock으로 대체해 작성.
- **Playwright e2e 6종 무수정 통과** — 합성 미사용 기본 흐름 완전 동일.
- i18n ko+zhTw. 모달 안내문에서 "AI 분리 ~$0.19" 문구를 "서버에서 직접 분리(무료)"로 갱신.

---

## Task 1: 서버 — ONNX 누끼 모듈 + obtainCutout 교체

**Files:** `apps/server/package.json`(onnxruntime-node 추가), `apps/server/src/common/media/background-removal.ts`(신규+spec), `apps/server/src/common/media/character-composite.ts`(obtainCutout 교체), `Dockerfile`(모델 다운로드), `.gitignore`(models/), `deploy/.env.example`(CUTOUT_MODEL_PATH 설명), 관련 spec

- [ ] `background-removal.ts`:
  - `loadCutoutSession()`: `process.env.CUTOUT_MODEL_PATH ?? path.join(process.cwd(), 'models/isnet-anime.onnx')`에서 onnxruntime InferenceSession 1회 생성·캐시. 파일 없으면 `'배경 제거 모델이 없습니다: {path} — models/isnet-anime.onnx를 내려받으세요'` 에러.
  - `removeBackground(buffer: Buffer): Promise<Buffer>`: loadImage→1024² 캔버스에 letterbox 없이 stretch 리사이즈→RGB float32 CHW /255 → session.run → 출력 saliency를 원본 크기로 bilinear 리사이즈(캔버스 이용) → 알파 적용(0~1×255, 0.05 이하 0으로 클램프) → 투명 PNG 버퍼.
  - 추론 호출부는 `runInference(session, tensor)` 같은 얇은 래퍼로 분리해 유닛 테스트에서 mock 가능하게.
- [ ] `character-composite.ts`의 obtainCutout: 알파 경로 유지, AI 분리 경로 삭제 → `removeBackground`로 교체. AI 로그 대신 일반 로깅(비용 0, 외부 호출 없음). imageAi 의존 제거(시그니처 정리, 프로세서 호출부 갱신).
- [ ] Dockerfile: 런타임 스테이지에 `RUN mkdir -p /app/models && curl -fL -o /app/models/isnet-anime.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-anime.onnx` (builder 아닌 최종 스테이지, 레이어 캐시 활용). `.dockerignore`에 models/ 추가(로컬 파일 복사 방지).
- [ ] `.gitignore`에 `models/` 추가.
- [ ] 유닛: 래퍼 mock으로 removeBackground 알파 적용 검증 1건(saliency 절반 마스크 → 절반 투명), 모델 부재 에러 1건, obtainCutout이 알파 없는 입력에서 removeBackground를 타고 캐시 저장 1건(기존 캐시 스펙 갱신).

## Task 2: UI 문구 갱신

**Files:** `apps/web/src/pages/ReviewDetailPage.tsx`(문구 키만), `apps/web/src/i18n/messages.ts`, `full-guide.ts`

- [ ] 캐릭터 원본 합성 안내문: "투명 배경 PNG면 무손실, 아니면 최초 1회 AI 분리(~$0.19) 후 저장해 재사용합니다" → "투명 배경 PNG면 그대로, 아니면 서버가 직접 배경을 제거합니다(무료, 최초 1회 후 재사용)" (ko+zhTw).

## Task 3: 검증 (Claude 담당 — Codex 범위 아님)

- [ ] dev 모델 다운로드, 실제 webp로 로컬 누끼 품질 확인, build·서버 전체 테스트·e2e 6종 무수정
- [ ] 커밋(로컬). 배포·운영 실측은 사용자 승인 후.

**보고에 포함:** 파일 목록, 건너뛴 명령, 계획과 다른 부분.

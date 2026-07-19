# OpenAI OCR(비전)·STT(Whisper) Provider 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미지 광고의 문구 추출(비전 OCR)과 영상 광고의 음성 전사(Whisper)를 실제 Provider로 연결. 이것으로 Sensor Tower 임포트 광고(이미지·영상)의 실전 분석 경로가 열린다. 다운로드된 자산에 수동으로 처리(OCR/STT)를 거는 `processMediaAsset` mutation 추가.

## ⚠️ 비용 통제 원칙 (사용자 명시 지시 — 테스트 단계)

1. **실제 API 키를 쓰는 검증은 각 1건만**: 이미지 OCR 1건, 영상 STT 1건, 이어지는 광고 분석 1건. 그 이상 절대 금지.
2. **배치 실행 API를 만들지 않는다** — 자산별 수동 트리거(`processMediaAsset`)만. 일괄 처리 mutation은 사용자가 명시적으로 요청하는 시점에 별도 설계(건수 확인 절차 포함)로 추가한다.
3. **자동 체인 없음 (확인됨)**: `download-external-media`는 `PROCESS_MEDIA`를 등록하지 않는다 — 임포트만으로는 과금 경로가 없다. 이 성질을 깨뜨리는 변경 금지.
4. Codex 샌드박스는 네트워크 불가이므로 실호출 위험 없음. 단위 테스트는 전부 가짜 클라이언트 주입.

---

## 누적 환경 제약

이전 계획서들의 항목 전부 동일 적용. 추가 실측 교훈:

15. **프롬프트에는 기대 JSON 필드명을 반드시 명시한다** — 실모델은 프롬프트에 없는 키 이름을 맞출 수 없다 (OpenAI 전환 첫날 실측. `generation.prompts.ts`의 수정된 시스템 프롬프트 형식을 따를 것).
16. pnpm 엄격 모드: 전이 의존성은 직접 추가해야 한다 (express 사례).

---

## 설계 결정

- **OCR = 비전 채팅 호출**: `client.chat.completions.create`에 `image_url`(base64 data URL) 콘텐츠 파트. 모델은 `OCR_MODEL` env, 미설정 시 `TEXT_AI_MODEL` 재사용. 키도 `TEXT_AI_API_KEY` 재사용 (별도 OCR 키 env를 늘리지 않는다 — YAGNI).
- **STT = Whisper**: `client.audio.transcriptions.create`. 모델 `STT_MODEL` env (기본 `whisper-1`), 키는 `STT_API_KEY` 미설정 시 `TEXT_AI_API_KEY` 재사용. **25MB 초과 파일은 명확한 오류로 거부** — "영상이 25MB를 초과합니다. FFmpeg 오디오 추출(추후 작업)이 필요합니다". Whisper는 mp4/webm 등을 직접 받으므로 영상 버퍼를 그대로 전달.
- OCR usage → 비용 기록: `OcrOutput`에 `inputTokens?/outputTokens?/costEstimateUsd?` 추가, 프로세서에서 meta에 Object.assign (텍스트 Provider와 동일 패턴). STT는 토큰 개념이 없고 분 단위 과금인데 재생 시간을 모르므로 비용 추정 생략 (주석으로 명시).
- OCR 시스템 프롬프트에 JSON 구조 명시 (교훈 15): `{"text": "이미지에서 보이는 모든 텍스트"}`.

---

## 파일 구조 (추가/변경)

```
apps/server/src/providers/ocr/
├── ocr.provider.ts                    # OcrOutput usage 필드 추가
├── openai-ocr.provider.ts (+spec)     # 비전 호출, base64 data URL
└── ocr.module.ts                      # 'openai' 분기
apps/server/src/providers/stt/
├── openai-stt.provider.ts (+spec)     # Whisper, 25MB 가드
└── stt.module.ts                      # 'openai' 분기
apps/server/src/common/env.validation.ts   # OCR_MODEL, STT_MODEL, STT_API_KEY, enum 확장
apps/server/src/queues/media-processing.processor.ts  # OCR usage → meta 반영
apps/server/src/modules/media/
├── media.service.ts                   # processMediaAsset (수동 트리거)
├── media.resolver.ts                  # mutation 추가
apps/web/src/pages/SourceAdsPage.tsx   # 광고 행에 "미디어 텍스트 추출"·"광고 분석" 버튼
.env.example
```

---

### Task 1: env 확장

- [ ] `env.validation.ts`:
```typescript
  OCR_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OCR_MODEL: z.string().optional(), // openai면 TEXT_AI_MODEL로 폴백
  STT_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  STT_API_KEY: z.string().optional(), // 미설정 시 TEXT_AI_API_KEY 재사용
  STT_MODEL: z.string().default('whisper-1'),
```
`.superRefine`: `OCR_PROVIDER==='openai'`인데 `OCR_MODEL`도 `TEXT_AI_MODEL`도 없으면 거부. `STT_PROVIDER==='openai'`인데 `STT_API_KEY`도 `TEXT_AI_API_KEY`도 없으면 거부.
- [ ] `.env.example` 갱신 (주석 포함)
- [ ] Commit (Codex 건너뜀): `chore: OCR·STT openai 선택 환경변수`

---

### Task 2: OpenAIOcrProvider — TDD (가짜 클라이언트 주입)

- [ ] spec 케이스: ①요청에 모델·시스템 프롬프트·`data:image/...;base64,` URL이 포함 ②응답 JSON의 text 파싱 ③usage 토큰 → 필드 매핑(가격 env 있으면 cost 계산 — 텍스트 Provider의 가격 env 재사용) ④응답이 JSON이 아니면(모델이 그냥 텍스트를 뱉으면) **전체 응답을 text로 사용** (OCR은 스키마 실패로 버리기엔 아까움 — 관용 파싱) ⑤API 오류는 throw
- [ ] 구현 핵심:
```typescript
const OCR_SYSTEM = `이미지에 보이는 모든 텍스트를 추출하라. 광고 이미지라면 훅 문구·자막·버튼 텍스트를 빠짐없이 포함하라.
반드시 아래 JSON 구조로만 응답하라:
{"text": "추출한 전체 텍스트 (줄바꿈 유지)"}`;

async extractText(input: OcrInput): Promise<OcrOutput> {
  const dataUrl = `data:${input.contentType};base64,${input.buffer.toString('base64')}`;
  const res = await this.client.chat.completions.create({
    model: this.model,
    messages: [
      { role: 'system', content: OCR_SYSTEM },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }] },
    ],
    response_format: { type: 'json_object' },
  });
  // JSON이면 .text, 아니면 원문 전체 — 관용 파싱
}
```
- [ ] `ocr.module.ts` 분기, `OcrOutput` 확장, 프로세서 meta 반영 (mock 회귀 확인)
- [ ] Commit: `feat: OpenAI 비전 OCR Provider`

---

### Task 3: OpenAISttProvider — TDD (가짜 클라이언트 주입)

- [ ] spec 케이스: ①모델·파일 전달 (`toFile(buffer, filename)` — openai SDK의 uploads 헬퍼) ②text·language 매핑 ③**25MB 초과 버퍼는 호출 전 거부** (오류 메시지에 "FFmpeg 오디오 추출" 언급) ④API 오류 throw
- [ ] 구현: `client.audio.transcriptions.create({ file: await toFile(input.buffer, input.filename ?? 'media.mp4'), model: this.model })`. 응답 `text`, language는 응답에 있으면 매핑 (whisper-1 json 기본 응답은 text만 — language 없으면 undefined).
- [ ] `stt.module.ts` 분기
- [ ] Commit: `feat: OpenAI Whisper STT Provider (25MB 가드)`

---

### Task 4: processMediaAsset 수동 트리거

- [ ] `media.service.ts`에 `processMediaAsset(mediaAssetId)`: 자산 존재·status UPLOADED 확인(PENDING이면 "업로드 미완료", READY면 재처리 허용 — 기존 결과에 추가됨을 주석으로) → 기존 `PROCESS_MEDIA` 잡 등록 (idempotent jobId 재사용 — removeOnComplete라 재실행 가능) → Job 반환. **배치 버전을 만들지 말 것 (비용 통제 원칙 2).**
- [ ] `media.resolver.ts`에 mutation (Roles ADMIN/EDITOR/REVIEWER). **generate-schema.ts 확인 — MediaResolver는 이미 등록되어 있으므로 변경 불필요.**
- [ ] `SourceAdsPage.tsx`: mediaAsset이 연결된 광고 행에 두 버튼 — "미디어 텍스트 추출"(→ processMediaAsset, useJobPolling) · "광고 분석"(→ 기존 analyzeSourceAd, useJobPolling). 완료 시 refetch. dialog 금지.
- [ ] 기존 통합 테스트(media-pipeline)에 processMediaAsset 재처리 케이스 1건 추가 (mock 기준)
- [ ] Commit: `feat: 다운로드 자산 수동 처리 트리거 (배치 없음 — 비용 통제)`

---

### Task 5: 라이브 스모크 (키 있을 때만, 각 1건)

- [ ] `apps/server/test/openai-smoke.e2e-spec.ts`에 추가 (기존 파일 확장):
  - OCR: 픽스처 1×1 PNG가 아니라 **텍스트가 있는 작은 테스트 이미지가 필요** — `e2e/fixtures/`에 새로 만들지 말고, 테스트 내에서 실행을 건너뛰도록: OCR 스모크는 Claude 검증 단계에서 실제 ST 이미지 1건으로 수행한다고 주석 명시. 스모크 파일에는 STT만 추가하지 않고 **둘 다 생략** — 이 Provider들의 라이브 검증은 실데이터 1건씩으로 Claude가 수행 (이 계획의 비용 통제 원칙).
  - 즉 이 태스크는 실제로는: 스모크 파일에 "OCR·STT 라이브 검증은 운영 데이터 1건씩 수동 수행 — 비용 통제" 주석만 추가.
- [ ] Commit: `docs: OCR·STT 라이브 검증 정책 주석`

---

## 완료 체크리스트

- [ ] mock 기본값에서 기존 테스트 전체 회귀 없음 (1순위)
- [ ] 단위 테스트(가짜 클라이언트): OCR 요청 형식·관용 파싱·usage, STT 25MB 가드
- [ ] env 조합 오류 시 부팅 거부 + 명확한 메시지
- [ ] (Claude 검증) 실키로 **이미지 1건 OCR → 그 광고 1건 분석 → 영상 1건 STT** — 딱 3건, 그 이상 금지

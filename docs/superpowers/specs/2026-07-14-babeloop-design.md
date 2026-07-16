# BabeLoop 설계 문서

작성일: 2026-07-14
상태: 사용자 승인 대기

## 0. 이 문서의 위치

`PROJECT_SPEC.md`가 제품 기획과 기술 요구사항의 원천이다. 이 문서는 스펙을 검토하며 발견한 설계 공백을 사용자와의 문답으로 확정한 결과를 담는다.

**두 문서가 충돌하면 이 문서가 우선한다.** 이 문서가 스펙을 명시적으로 덮어쓰는 지점:

| 스펙 | 이 문서의 결정 |
|---|---|
| 12장: `workspaces`, `workspace_members`, `roles`, `permissions` 테이블 | workspace 개념 제거, 역할은 `User.role` enum 4개 |
| 19장: 역할 7개 | 역할 4개 (ADMIN / EDITOR / REVIEWER / VIEWER) |
| 27장: 문서 9개 선행 작성 | 문서 3개로 축소 (아래 15장) |
| 25장: Phase 단위 개발 | 수직 슬라이스 0~5 (아래 12장) |

그 외 스펙의 모든 원칙(특히 28장 핵심 설계 원칙 18개)은 그대로 유효하다.

---

## 1. 확정된 설계 결정 요약

사용자 문답으로 확정한 사항:

1. **Attribution**: BabeChat에 MMP가 붙어 있는지 현재 불명. MMP는 나중에 도입 가능하다는 전제로, `PerformanceDataProvider` 인터페이스 + 추적코드 체계를 1일차부터 구축한다. (아래 7장)
2. **팀 규모**: 2~5명, 역할 경계 흐림. 권한 시스템 최소화. (아래 5장)
3. **zh-TW 검수자**: 실존한다. 현지화 검수는 상태 머신이 강제하는 진짜 게이트로 구현한다. (아래 8장)
4. **콘텐츠 수위**: 앱은 성인향 요소가 있으나 광고는 수위를 낮춘다. 이 괴리 자체가 플랫폼 정책 위반 요인이므로 BabeGuard에 정합성 검사 축을 추가한다. (아래 9장)
5. **빌드 전략**: 수직 슬라이스. 되돌릴 수 없는 것만 슬라이스 0에 포함.
6. **작업 상태 전달**: Polling (스펙 11장 그대로). 프런트 폴링 훅 하나로 국소화하여 추후 Subscription 전환 비용을 최소화.
7. **인증**: 이메일+비밀번호 세션으로 시작. OIDC는 인터페이스만 예약.

---

## 2. 아키텍처

기술 스택은 스펙 9장 그대로이며 변경하지 않는다.

```
pnpm monorepo
├── apps/server     NestJS — GraphQL API + React 정적 서빙 + Worker + Scheduler
│                   같은 코드베이스, 실행 모드 3개: main.ts / worker.ts / scheduler.ts
├── apps/web        React + Vite + Apollo Client + GraphQL Code Generator
├── packages/shared 추적코드 생성/파싱, 공통 enum, Zod 스키마 (서버·웹 공용)
└── prisma/         스키마 단일 진실 원천 → ERD 자동 생성
```

Docker Compose 서비스: `api`, `worker`, `scheduler`, `postgres`(pgvector), `redis`, `minio`.

- MVP에서는 reverse-proxy 없이 NestJS가 직접 요청을 받는다. TLS는 배포 시점에 추가.
- MinIO는 로컬 개발용 S3 호환 스토리지. 운영 전환 시 환경변수만 교체 (코드 동일).
- GraphQL 엔드포인트 `/graphql`, SPA fallback에서 `/graphql`, `/webhooks`, `/oauth`, `/uploads`, `/health`, `/ready` 제외 (스펙 10장 그대로).

### 인증

- 이메일+비밀번호, 세션 쿠키. 내부 도구 2~5명 규모에서 Google OAuth의 GCP 앱 등록은 첫 실행을 늦추는 외부 의존이므로 배제.
- `AuthService` 인터페이스 뒤에 두어 추후 OIDC 구현체 추가 가능하게 한다.

---

## 3. 모듈 절단면 — 스펙 6개 모듈의 MVP 범위

이 표가 Codex에게 주는 범위 통제선이다. "MVP 제외" 열의 기능은 인터페이스와 테이블 자리만 예약하고 구현하지 않는다.

| 스펙 모듈 | MVP 범위 | MVP 제외 (인터페이스만 예약) |
|---|---|---|
| BabeRadar | 수동 등록만: URL 입력, 파일 업로드, Sensor Tower Creative Gallery CSV 임포트(+미디어 즉시 다운로드) | Sensor Tower·Meta·TikTok API 자동 동기화 |
| BabeStudio | OCR·전사(Mock) → 분석 → 임베딩 → 브리프 → 문구·스크립트 생성 → zh-TW 초안 | 이미지·영상 실생성, 영상 장면 분할 |
| BabeReview | 검토 큐, zh-TW 검수 게이트, 승인/수정요청/거절, 버전 이력 | 담당자 자동 배정, 댓글 스레드 |
| BabePublisher | **파일 내보내기만** — 추적코드가 파일명·메타에 각인된 패키지 생성 | Instagram/TikTok 게시 전체 (Phase 5) |
| BabePulse | 성과 CSV 업로드 → 추적코드 조인 → 소재별 퍼널 비교 | Meta/TikTok 성과 API, MMP 연동 |
| BabeGuard | 문구 유사도 검사, 금지어, 정합성 체크리스트, 미성년자 하드게이트 | 이미지 유사도, 자동 정책 판정 |

---

## 4. Provider 계층

스펙 9.6의 원칙 그대로: 모든 외부 의존은 인터페이스 뒤에, MVP는 전부 Mock으로 구동 가능.

```
TextGenerationProvider      → MockTextGenerationProvider (결정적 응답)
EmbeddingProvider           → MockEmbeddingProvider (해시 기반 결정적 벡터)
OcrProvider                 → MockOcrProvider
SpeechToTextProvider        → MockSttProvider
CompetitorDataProvider      → ManualUrlProvider, ManualFileProvider,
                              SensorTowerCreativeGalleryCsvProvider
PerformanceDataProvider     → CsvPerformanceProvider, AirbridgePerformanceProvider,
                              MockPerformanceProvider
```

### SensorTowerCreativeGalleryCsvProvider (2026-07-14 추가)

Sensor Tower API 권한이 없어도 웹 UI의 Unified Creative Gallery 내보내기(CSV)를 수동 다운로드할 수 있음이 확인됐다. 실물 파일 기준 형식: **UTF-16LE + 탭 구분**, 컬럼 = Advertiser App ID/Name, Creative URL, Networks, Duration, First Seen, Last Seen, Impression Share, Countries, Type, Format, Placements, Dimensions, Video Duration.

- First/Last Seen, Duration → 스펙 7장의 대리 신호에 직접 매핑
- Impression Share → `isEstimated: true, confidence: MEDIUM`
- **Creative URL은 만료 가능한 S3 링크이므로 임포트 즉시 `download-external-media` 작업으로 미디어를 자체 스토리지에 보관한다** (지연 시 소재 유실)
- 파서는 인코딩(UTF-16/UTF-8) 자동 감지 필수. 실물 CSV 일부를 테스트 픽스처로 사용한다.

- Provider 선택은 환경변수 (`TEXT_AI_PROVIDER=mock` 등).
- Mock은 결정적(deterministic)이어야 한다 — 같은 입력에 같은 출력. E2E 테스트가 이것에 의존한다.
- `PerformanceDataProvider`는 스펙에 없던 인터페이스로, 이 문서가 추가한다. MMP(AppsFlyer 등)·Meta Insights·CSV가 모두 이 인터페이스의 구현체가 된다.

### AI 실행 기록

모든 AI 호출(성공·실패 모두)은 `ai_execution_logs`에 기록한다: provider, 모델명, 프롬프트 템플릿 버전, 입력 데이터 ID, 출력 또는 오류, 토큰 사용량, 지연시간, 비용 추정치, 생성 시각 (스펙 9.6 그대로). 실패를 기록하지 않으면 프롬프트 품질 문제를 추적할 수 없다.

---

## 5. 권한 모델

```prisma
enum UserRole { ADMIN, EDITOR, REVIEWER, VIEWER }
```

- workspace, permissions 테이블 없음. 단일 팀, 단일 브랜드 전제.
- 역할별 능력: VIEWER는 조회만. EDITOR는 등록·업로드·생성 실행·수정. REVIEWER는 EDITOR 능력 + 현지화 검수 + 승인/수정요청/거절. ADMIN은 전부 + 사용자 관리. 승인 전이(`LOCALIZATION_APPROVED`, `APPROVED`)는 REVIEWER와 ADMIN만 실행할 수 있다.
- 코드로 강제하는 불변 규칙은 2개뿐:
  1. **자기승인 금지**: 소재를 생성·수정한 사용자는 그 소재를 승인할 수 없다.
  2. **현지화 게이트**: zh-TW 소재는 REVIEWER의 현지화 검수 없이 `APPROVED`로 전이할 수 없다. UI가 아니라 서버 상태 머신에서 차단한다.
- 역할별 화면 접근 제어는 GraphQL Guard 데코레이터 수준의 단순 검사.

---

## 6. 데이터 모델 전략

스펙 12장의 60여 개 테이블을 한 번에 만들지 않는다. 슬라이스가 요구하는 시점에 추가한다.

| 슬라이스 | 추가 테이블 |
|---|---|
| 0 | `users`, `brands`, `brand_features`, `brand_guidelines`, `markets`(TW 시드), `ai_execution_logs` |
| 1 | `media_assets`, `media_variants`, `jobs`, `ocr_results`, `transcriptions` |
| 2 | `source_ads`, `creative_analyses`, `creative_embeddings`, `creative_tags` |
| 3 | `creative_briefs`, `generated_creatives`, `generated_variants`, `localization_versions`, `prompt_templates` |
| 4 | `review_requests`, `policy_checks`, `experiments`, `experiment_variants`, `export_packages` |
| 5 | `performance_imports`, `performance_daily`, `funnel_events` |

### 공통 관례

- **DataProvenance**: 테이블이 아니라 컬럼 관례. 외부에서 온 데이터를 담는 모든 테이블에 `provider`, `source_url`, `observed_at`, `imported_at`, `is_estimated`, `confidence` 컬럼 세트를 포함한다 (스펙 7장 타입 그대로).
- **pgvector**: `creative_embeddings` 테이블 하나. `vector(1536)` 고정 + `model`, `dimension` 메타 컬럼. 모든 벡터 검색 쿼리에 `model` 필터 강제 (스펙 14장 "모델 혼합 검색 금지"). SQL은 `VectorSearchRepository`에만 존재한다.
- **soft delete 안 함**: 내부 도구다. 삭제는 삭제다. 이력이 필요한 것(검토, 승인)은 이벤트 테이블로 남긴다.

---

## 7. Attribution 설계 (스펙의 최대 공백)

### 문제

성과 데이터는 두 세계에서 온다. 노출·클릭·설치는 광고 플랫폼이 소재 단위로 알지만, 가입·첫 메시지·D1은 BabeChat 서버만 알고 서버는 유저가 어느 광고에서 왔는지 모른다. 이 고리를 잇는 것이 MMP인데 현재 BabeChat의 MMP 상태는 불명이다.

### 설계

1. **추적코드를 1일차부터 발급한다.** 이것은 소급 불가능하다 — 추적코드 없이 집행한 광고의 성과는 영구히 소재 단위로 연결할 수 없다.

   ```
   형식: BL-{실험코드}-{변형코드}-R{리비전}   예: BL-TW01-H3-R1
   각인 위치:
   - 내보내기 파일명:     BL-TW01-H3-R1_9x16_15s.mp4
   - 광고 관리자 광고명:  BL-TW01-H3-R1 | zh-TW | hook=question
   - 랜딩 URL:           ?utm_content=BL-TW01-H3-R1
   - 성과 CSV 필수 컬럼:  tracking_code
   ```

   - `experiment_variants.tracking_code`에 unique 저장.
   - 생성·파싱 로직은 `packages/shared`에 둔다 (서버·웹 동일 규칙).
   - `EXPORTED` 이후 소재 수정 불가. 수정 = 새 리비전 = 새 추적코드. 내보낸 파일과 성과 데이터가 가리키는 소재가 항상 동일함을 보장한다.

2. **데이터 그레인을 UI에 정직하게 표시한다.** 가입 이후 퍼널을 소재 단위로 쪼갤 수 없는 동안, 대시보드는 이를 숨기지 않는다:

   ```
   설치    소재 단위     ✓ (광고 플랫폼 CSV)
   가입    캠페인 단위   ⚠ 소재 단위 불가 — MMP 미연동
   ```

   안분(비율 배분)으로 소재 단위 숫자를 만들어내지 않는다. 스펙 원칙 10("경쟁사 성과를 실제 성과처럼 표현하지 않는다")을 자체 성과에도 적용한 것이다.

3. **운영 규칙: 소재 1개 = 광고 1개.** Meta Dynamic Creative처럼 광고 하나에 소재 여러 개를 묶으면 소재 단위 분석이 원천 불가능해진다. 내보내기 패키지에 이 규칙을 안내 문구로 포함한다.

4. **MMP 연동은 `PerformanceDataProvider` 구현체 추가로 처리한다.** 도메인 로직·스키마·대시보드는 변경 없음. MMP를 붙이는 날 과거 CSV 데이터도 같은 추적코드로 조인되므로 연속성이 유지된다.

### MMP 확정: Airbridge (2026-07-14)

BabeChat은 Airbridge를 사용 중임이 확인됐다. 이로써 가입·첫 메시지의 소재 단위 귀속이 원칙적으로 가능하다.

- 조인 경로: 광고 관리자 광고명에 추적코드 각인 → Airbridge 리포트의 캠페인/광고 이름 차원에 노출 → 리포트 CSV에서 추적코드 파싱 → `experiment_variants` 조인. 추적코드 설계가 그대로 유효하다.
- MVP는 Airbridge 리포트 CSV 업로드(`AirbridgePerformanceProvider`의 CSV 경로)로 시작하고, Airbridge API 연동은 이후 슬라이스.
- iOS는 ATT/SKAdNetwork 제약으로 광고 단위 귀속이 부분적일 수 있다 → 대시보드 그레인 표시가 OS별로 구분해야 한다 (Android 소재 단위 / iOS 제한 가능).

### 성과 데이터의 실질 원천: Snowflake (2026-07-15, 사내 대시보드 샘플 코드 분석 결과)

사내 대시보드(`dashboard_sample`)를 분석한 결과, 회사의 실질적 데이터 웨어하우스는 Snowflake이며 다음이 이미 적재되고 있다:

- `BABECHAT_TW.AIRBRIDGE.WEB_EVENTS` (+ Order Complete 이벤트) — Airbridge 데이터 자동 적재. **TW 추적 시작 2026-06-10, 6/1~9 결손 구간 존재.**
- `BABECHAT_TW.BABECHAT.*` — 운영 DB 복제본 (USERS, ORDERS, CHARACTERS, ATTENDANCES, FOLLOWS, DAILY_CHARACTER_STATS 등). 가입·결제 퍼널 이벤트를 SQL로 직접 조회 가능.
- 리전별 DB: `BABECHAT_TW`(대만) / `BABECHAT`(한국) / `BABECHAT_JP`(일본), RAW_DATA JSON(variant) 컬럼 패턴.
- 접속: 키페어 인증(SNOWFLAKE_JWT) 패턴이 사내에서 이미 사용 중.

**설계 반영:** Airbridge API 직접 연동보다 `SnowflakePerformanceProvider`가 우선 후보다. 가입·결제는 운영 DB 복제본, 광고 귀속은 AIRBRIDGE 스키마에서 조인. CSV 업로드는 여전히 MVP 경로이자 영구 폴백.

**실증된 데이터 품질 리스크** (그레인·출처 정직 표시 설계의 근거): 파이프라인 적재 중단 이력(TW USERS 06-30 정지), 통화 기준 변경(KRW→TWD 재적재로 스냅샷 간 비교 불가), 추적 시작일 이전 데이터 부재. → `performance_daily`에 적재 커버리지(coverage) 메타를 함께 저장하고 대시보드에 표시한다.

---

## 8. 생성물 상태 머신

이 시스템의 척추. 서버가 강제하는 단방향 전이만 허용한다.

```
DRAFT → POLICY_CHECKED → IN_REVIEW → LOCALIZATION_APPROVED → APPROVED → EXPORTED
                              │
                              ├→ REVISION_REQUESTED → DRAFT (새 리비전)
                              └→ REJECTED (종결)
```

- zh-TW 소재는 `LOCALIZATION_APPROVED` 단계를 건너뛸 수 없다. (zh-TW가 아닌 소재는 이 단계를 자동 통과)
- `POLICY_CHECKED`는 BabeGuard 검사 완료를 의미. 미성년자 게이트 플래그가 서면 사람 서명 없이 `IN_REVIEW`로 못 간다.
- 자기승인 금지는 `IN_REVIEW → LOCALIZATION_APPROVED`와 `→ APPROVED` 전이에서 검사한다.
- 불법 전이는 GraphQL 오류로 명시적으로 실패한다. 상태 머신 전이 전체가 단위 테스트 대상이다.

---

## 9. BabeGuard 설계

스펙 8.6에 두 가지 축을 추가·격상한다.

### 미성년자 하드게이트 (격상)

스펙의 한 줄짜리 불릿("미성년자로 보일 수 있는 캐릭터와 성인 소재 조합 차단")을 별도 등급으로 격상한다. 이것은 플랫폼 정책이 아니라 각국 형사법 영역이며, 이 시스템은 애니메이션풍 캐릭터 + 감정·관계 소재를 자동 대량 생성하므로 구조적으로 노출되어 있다.

- **설정으로 끌 수 없다.** 수위 정책의 나머지는 설정값이지만 이 게이트만은 하드코드.
- **AI 점수로 통과되지 않는다.** AI는 플래그만 세울 수 있고, 해제는 사람 서명(사유 기록 포함)만 가능.
- **임계치 조정으로 우회할 수 없다.**

### 정합성 검사 (추가)

Meta·TikTok 심사는 소재만 보지 않고 랜딩·앱스토어·앱까지 본다. "광고는 깨끗한데 앱은 성인향"이라는 괴리 자체가 반려·계정정지 사유다. BabeGuard 체크리스트에 "소재-도착지 정합성" 항목을 추가한다. MVP에서는 사람이 확인하는 체크리스트 항목이고, 자동화는 이후.

### 반려 피드백 루프 (추가)

실제 플랫폼 반려는 사고가 아니라 학습 데이터다.

```
반려된 소재 + 반려 사유 + 플랫폼 → policy_checks에 실측 기록
  → 임베딩 → 다음 생성 시 "이 표현은 이 플랫폼에서 반려됨" 컨텍스트 주입
```

MVP에서는 반려 결과를 수동 입력하는 화면만 만든다. 자동 수집은 게시 API 연동(Phase 5) 이후.

---

## 10. 데이터 흐름

MVP 완료 조건(스펙 26장) 14단계의 시스템 관점:

```
[수집]     URL/파일 등록 → Presigned URL 발급 → MinIO 직접 업로드 → completeMediaUpload
              → BullMQ: extract-metadata → run-ocr → transcribe → analyze-creative
[분석]     분석 결과(Zod 검증 JSON) → creative_analyses → generate-embedding → pgvector
              → 유사 광고 검색 가능
[생성]     브리프 생성(브랜드 가이드 + 분석 패턴 RAG) → 문구·스크립트 변형 생성
              → localize-zh-tw → DRAFT 저장
[검증]     run-policy-check: 유사도 + 금지어 + 미성년자 게이트 → POLICY_CHECKED
[검토]     REVIEWER 검수·수정 → LOCALIZATION_APPROVED → APPROVED
[내보내기] export_package 생성 — 추적코드 각인 파일명 + 광고관리자용 메타 텍스트 → EXPORTED
[성과]     성과 CSV 업로드 → tracking_code 조인 → 소재별 퍼널 대시보드
[환류]     성과 상위 패턴 → 다음 브리프 생성 컨텍스트로 주입
```

### 작업 상태 전달

- 모든 비동기 작업은 GraphQL `Job` 타입 하나로 통일.
- 프런트는 단일 폴링 훅(2초 간격)으로만 상태를 읽는다. 화면마다 다른 방식을 만들지 않는다.
- Subscription 전환 시 이 훅 내부만 교체하면 된다. Worker에서 완료되는 작업을 API 프로세스의 WebSocket으로 릴레이하려면 Redis Pub/Sub 다리가 필요한데, 내부 도구 5명 규모에서 그 부품 비용이 체감 이득을 초과하므로 MVP에서는 도입하지 않는다 (스펙 11장의 결정과 일치).

---

## 11. 오류 처리

스펙 21장 "반드시 테스트할 상황"에 대한 설계 대응:

| 상황 | 설계 |
|---|---|
| AI가 잘못된 JSON 반환 | Zod 파싱 실패 → 오류 포함 재요청(repair prompt) 1회 → 재실패 시 Job 실패 기록, 사용자에게 원문 표시 |
| 동일 URL 중복 등록 | URL 정규화 후 unique 제약 → 오류가 아니라 기존 레코드 안내 |
| 동일 파일 중복 업로드 | 콘텐츠 해시로 감지 → 기존 레코드 안내 |
| 동일 Job 중복 실행 | BullMQ jobId = 결정적 키 `{jobType}--{sourceId}--{inputHash}` — 큐 수준에서 차단. 주의: BullMQ 커스텀 jobId에 `:` 사용 불가 (Redis 키 구분자, 슬라이스 1에서 실측) |
| CSV 중복 업로드 | 파일 해시 + 행 단위 `(tracking_code, date, platform)` upsert — 멱등 |
| 업로드 중 이탈 (고아 파일) | `media_assets.status=PENDING` → maintenance 큐가 24시간 경과분을 MinIO 대조 후 정리 |
| 영상 처리 실패 | 재시도 3회 지수 백오프 → 영구 실패는 사유와 함께 `jobs`에 기록, UI 수동 재실행 |
| OAuth 토큰 만료 | MVP 범위 외 (게시 API 없음). Provider 인터페이스에 `validateCredentials()` 예약 |
| pgvector 차원 불일치 | 저장 시점에 `dimension` 검증 — 검색이 아니라 쓰기에서 차단 |
| 승인 없는 게시 시도 | 상태 머신이 차단 (EXPORTED는 APPROVED에서만 전이) |
| 광고 성과 날짜 누락 | CSV 파서가 행 단위 검증 → 오류 행 목록을 리포트로 반환, 정상 행만 반영 |

---

## 12. 빌드 순서 — 수직 슬라이스

각 슬라이스는 끝나면 사람이 화면에서 조작할 수 있는 상태가 된다. 완료 기준 = 해당 E2E 시나리오 green.

| # | 슬라이스 | 내용 | 완료 기준 (E2E) | 상태 |
|---|---|---|---|---|
| 0 | 골격 | 모노레포, Docker Compose, 인증, 브랜드/시장 등록, `ai_execution_logs` | 로그인 → 브랜드 등록 → 목록 표시 | ✅ 완료 (2026-07-14) |
| 1 | 업로드 파이프라인 | Presigned 업로드, MediaAsset, BullMQ, Mock OCR/전사, Job 폴링 | 이미지 업로드 → 분석 완료 → OCR 결과 표시 | ✅ 완료 (2026-07-15) |
| 2 | 분석·검색 | 광고 분석(Mock), 임베딩, pgvector 유사 검색 | 광고 2개 등록 → 유사 광고 검색 결과 표시 | ✅ 완료 (2026-07-16) |
| 3 | 생성 | 브리프 → 문구·스크립트 변형 → zh-TW 초안 | 브리프 생성 → 변형 3개 → zh-TW 초안 표시 | ✅ 완료 (2026-07-16) |
| 4 | 검토·내보내기 | 상태 머신, 검토 큐, BabeGuard 기본, 실험/변형, 추적코드, 파일 내보내기 | 검수 → 승인 → 추적코드 각인 패키지 다운로드 | ✅ 완료 (2026-07-16) |
| 5 | 성과 | CSV 업로드, 퍼널 대시보드, 그레인 표시, 브리프 환류 | CSV 업로드 → 소재별 퍼널 표시 → 환류 브리프 생성 | ✅ 완료 (2026-07-16) |

- 슬라이스 0~1에서 인프라 리스크(모노레포·GraphQL·큐·스토리지 패턴)가 대부분 해소된다. 이후 슬라이스는 확립된 패턴의 반복이다.
- 슬라이스 5 완료 = 스펙 26장 MVP 완료 조건 충족.

### 되돌릴 수 없는 결정 (지금 하는 것) vs 되돌릴 수 있는 결정 (미루는 것)

| 지금 (소급 불가) | 나중 (인터페이스로 열어둠) |
|---|---|
| 추적코드 발급 체계 | MMP 실제 연동 |
| `ai_execution_logs` (실패 포함) | 실제 AI Provider 선택 |
| DataProvenance 컬럼 관례 | Sensor Tower·게시 API 연동 |
| 소재 1개=광고 1개 운영 규칙 | Subscription 전환 |
| 상태 머신 (EXPORTED 불변성) | 이미지·영상 실생성 |

---

## 13. 테스트 전략

- **E2E (Playwright)**: 슬라이스당 1개, 완료 기준 그 자체. 슬라이스 5까지의 E2E 연쇄 = 스펙 26장 검증.
- **통합 (Jest + Testcontainers)**: PostgreSQL+pgvector, Redis 실컨테이너. 벡터 검색과 큐 프로세서는 mock 테스트가 무의미한 영역.
- **Provider Contract Test**: Mock과 실 Provider가 동일한 인터페이스 테스트 스위트를 통과해야 한다. 추후 실 Provider 추가 시 이 스위트가 계약 검증이 된다.
- **단위 테스트 집중 지점**: 상태 머신 전이 전체(불법 전이 포함), 추적코드 생성/파싱 왕복, CSV 파서, Zod 스키마.
- Mock Provider는 결정적이어야 한다 — E2E 안정성의 전제.

---

## 14. Codex 위임 프로토콜

구현은 Codex에게 슬라이스 단위로 위임한다. Claude는 슬라이스 사이의 검증 게이트.

```
[Claude] 설계 문서(이 문서) + 구현 계획(슬라이스별 작업 명세) 작성
[Codex]  슬라이스 N 구현 — 계획서 해당 섹션 + 이 문서를 컨텍스트로 전달
[Claude] 검증 — 빌드·테스트 실행, E2E 확인, 설계 이탈 리뷰
         불합격 → 구체적 수정 지시와 함께 재위임
[사용자] 슬라이스 데모 확인 → 다음 슬라이스 착수 승인
```

- 한 번에 전체를 맡기지 않는다. 슬라이스가 검증 가능한 최소 단위다.
- Codex에게 전달하는 컨텍스트에는 항상 "MVP 제외" 목록(3장)을 포함해 범위 초과를 방지한다.

---

## 15. 문서 계획 (스펙 27장 축소)

스펙 27장의 선행 문서 9개를 3개로 줄인다. 코드 없이 쓰는 문서는 상상이 되고, 코드와 어긋난 문서는 부채가 되기 때문.

| 문서 | 작성자 | 시점 |
|---|---|---|
| 이 설계 문서 | Claude | 완료 (선행 문서 9개의 결정사항을 흡수) |
| `docs/architecture.md` | Codex | 슬라이스 0 완료 후, 실제 코드 기준 |
| `docs/provider-contracts.md` | Codex | Provider 인터페이스 확정 시 |
| `docs/erd.md` | 자동 생성 | Prisma 스키마에서 (손으로 쓰지 않음) |

---

## 16. 미해결 가정 (Open Assumptions)

코드가 아니라 사람이 답해야 하는 것. 답이 나오는 대로 이 문서를 갱신한다.

1. ~~BabeChat 앱에 MMP가 붙어 있는가?~~ → **해소 (2026-07-14): Airbridge 사용 중, 데이터는 Snowflake에 적재됨.** 남은 확인 사항으로 좁혀짐:
   - ① `BABECHAT_TW.AIRBRIDGE` 스키마에 캠페인/광고 소재 단위 귀속 필드(channel, campaign, ad group, ad creative)가 들어오는가 — Snowflake 접속 권한 확보 후 테이블 목록·컬럼 확인으로 판명. 사내 대시보드는 유저 ID·IP 국가만 사용해서 이 코드로는 확인 불가였음.
   - ② BabeChat이 Airbridge로 쏘는 인앱 이벤트 목록 (Order Complete는 확인됨. 가입·첫 메시지·메시지 10개는 미확인 — 계측 추가 요청 필요할 수 있음)
   - ③ BabeLoop용 Snowflake 읽기 전용 계정 발급 가능 여부
2. **zh-TW 검수자의 실제 투입 가능 시간** — 검토 큐 적체 시 병목 지점.
3. **Meta/TikTok 광고 계정 상태** — 성인향 앱 이력으로 제한받는 계정인지.
4. **실제 AI Provider 선택** (텍스트/임베딩/OCR/STT) — MVP는 전부 Mock으로 돌므로 결정을 미룰 수 있음. 단 임베딩 차원(1536)은 스키마에 박히므로, 실제 임베딩 모델 선택 시 차원 확인 필요.

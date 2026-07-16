# BabeLoop

BabeChat 마케팅 자동화 플랫폼. 기획: `PROJECT_SPEC.md`, 설계: `docs/superpowers/specs/2026-07-14-babeloop-design.md`

## 요구사항

- Node 22+, pnpm 10+, Docker

## 시작하기

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm prisma:migrate
pnpm prisma:seed          # admin@babeloop.local / changeme-admin
```

## 개발

```bash
pnpm dev:server           # NestJS :3000 (GraphQL Playground /graphql)
pnpm dev:web              # Vite :5173 (API는 :3000으로 프록시)
pnpm --filter @babeloop/server build && pnpm start:worker  # BullMQ 워커 (업로드 분석에 필요)
```

## 프로덕션 모드 (단일 Origin)

```bash
pnpm build && pnpm start  # React 정적 빌드를 NestJS가 :3000에서 서빙
```

## 테스트

```bash
pnpm test                 # 서버 단위·통합 (Testcontainers — Docker 필요)
pnpm e2e                  # Playwright (인프라 기동 + 시드 완료 상태에서)
```

## 성과 CSV 형식

성과 화면에서 UTF-8 CSV 파일을 업로드해 추적코드별 일간 퍼널을 가져올 수 있다. 헤더 순서는 자유지만 다음 열은 모두 필요하다.

```csv
date,platform,tracking_code,impressions,clicks,installs,signups,first_messages,cost,currency
2026-07-10,META,BL-EXP-V1-R1,1000,50,10,5,3,2500,TWD
```

- `date`: `YYYY-MM-DD` 형식의 실제 날짜
- `platform`: `META`, `TIKTOK`, `OTHER` (대소문자 무관)
- `tracking_code`: BabeLoop 내보내기로 발급된 `BL-{실험코드}-V{변형}-R{리비전}` 형식
- `impressions`, `clicks`, `installs`, `signups`, `first_messages`: 비어 있거나 0 이상의 정수
- `cost`: 비어 있거나 0 이상의 숫자(소수 허용)
- `currency`: 비어 있으면 `TWD`

빈 지표는 데이터가 없다는 뜻의 `null`로 저장된다. 특히 `signups`와 `first_messages`의 빈 값은 실제 성과 `0`과 구분되며, 대시보드에는 `소재 단위 없음`으로 표시된다. 같은 날짜·플랫폼·추적코드를 다시 업로드하면 행을 추가하지 않고 기존 값을 갱신한다.

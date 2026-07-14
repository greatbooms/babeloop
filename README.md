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

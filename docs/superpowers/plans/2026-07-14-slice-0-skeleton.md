# BabeLoop 슬라이스 0 (골격) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 → 브랜드 등록 → 목록 표시가 동작하는 최소 시스템. React→GraphQL→Prisma→PostgreSQL 전 계층과 Docker Compose 인프라를 관통 검증한다.

**Architecture:** pnpm 모노레포. NestJS(GraphQL Code First)가 API와 React 정적 파일을 같은 Origin에서 서빙. 세션 기반 인증(이메일+비밀번호, Redis 세션 스토어). Prisma 스키마는 슬라이스 0 필요분만. Worker/Scheduler는 부팅만 되는 스텁.

**Tech Stack:** Node 22 LTS, pnpm 10, TypeScript 5, NestJS 11, @nestjs/graphql 13 (Apollo Driver), Prisma 6, PostgreSQL 17 (pgvector/pgvector:pg17 이미지), Redis 7, MinIO, React 19, Vite 6, Apollo Client, GraphQL Code Generator (client preset), React Hook Form + Zod, Jest + Testcontainers, Playwright.

**참조 문서:** `docs/superpowers/specs/2026-07-14-babeloop-design.md` (설계 결정 전체), `PROJECT_SPEC.md` (제품 요구사항 원천)

**버전 정책:** 아래 버전은 메이저 기준이다. 메이저 내 최신 안정판을 사용하고, 메이저가 다르면 계획 작성 시점과 API가 달라졌을 수 있으므로 공식 문서를 확인한다.

---

## 슬라이스 0 범위 통제

**포함:** 모노레포, Docker Compose 인프라, Prisma(User/Brand/BrandFeature/BrandGuideline/Market/AiExecutionLog), 세션 인증, 역할 Guard, 브랜드·시장 GraphQL, AiExecutionLog 서비스, React 로그인·브랜드 화면, ServeStatic, Worker/Scheduler 스텁, E2E 1개.

**제외 (다음 슬라이스):** 파일 업로드, BullMQ 실작업, MediaAsset, OCR, 임베딩, pgvector 쿼리, 생성·검토·성과 전부. CI 설정(git remote 생긴 뒤). `/webhooks` `/oauth` 경로(존재하지 않으므로 SPA fallback 제외 목록에도 아직 안 넣음 — YAGNI).

**이 슬라이스에서 확립되어 이후 슬라이스가 따라야 하는 패턴:**
1. GraphQL 모듈 구조 (`src/modules/<name>/` 안에 module/service/resolver/models/inputs)
2. Testcontainers 기반 통합 테스트 헬퍼 (`test/create-test-app.ts`)
3. 세션·Guard·역할 검사 방식
4. `AiExecutionLogService.record()` 래퍼 — 이후 모든 AI 호출이 이것을 통과한다
5. 환경변수는 Zod로 부팅 시 검증 — 잘못된 env로는 프로세스가 뜨지 않는다

---

## 파일 구조

```
babe-loop/
├── package.json                  # 루트: 스크립트 오케스트레이션만
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .env.example
├── docker-compose.yml            # postgres(pgvector), redis, minio
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                   # ADMIN 유저 + TW 시장
├── packages/shared/              # 이번 슬라이스에선 enum만. 추적코드는 슬라이스 4에서 추가
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
├── apps/server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   ├── jest.config.ts
│   ├── public/                   # React 빌드 산출물 복사 위치 (.gitignore)
│   ├── src/
│   │   ├── main.ts               # API 프로세스
│   │   ├── worker.ts             # 스텁
│   │   ├── scheduler.ts          # 스텁
│   │   ├── app.module.ts
│   │   ├── generated/            # Prisma Client + schema.gql (.gitignore)
│   │   ├── common/
│   │   │   ├── env.validation.ts
│   │   │   ├── prisma/prisma.module.ts
│   │   │   ├── prisma/prisma.service.ts
│   │   │   └── session/session.middleware.ts
│   │   ├── health/health.controller.ts
│   │   └── modules/
│   │       ├── auth/  (auth.module.ts, auth.service.ts, auth.resolver.ts,
│   │       │           gql-auth.guard.ts, roles.guard.ts, roles.decorator.ts,
│   │       │           current-user.decorator.ts, user.model.ts)
│   │       ├── brand/ (brand.module.ts, brand.service.ts, brand.resolver.ts,
│   │       │           brand.models.ts, brand.inputs.ts)
│   │       ├── market/ (market.module.ts, market.service.ts, market.resolver.ts,
│   │       │            market.model.ts)
│   │       └── ai-log/ (ai-log.module.ts, ai-execution-log.service.ts)
│   └── test/
│       ├── create-test-app.ts    # Testcontainers 헬퍼 (패턴의 원본)
│       ├── auth.e2e-spec.ts
│       ├── brand.e2e-spec.ts
│       └── market.e2e-spec.ts
├── apps/web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── codegen.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx               # 라우터 + 인증 가드
│       ├── apollo.ts
│       ├── generated/            # codegen 산출물 (.gitignore)
│       └── pages/
│           ├── LoginPage.tsx
│           └── BrandsPage.tsx
├── e2e/
│   ├── playwright.config.ts
│   └── slice0.spec.ts
└── docs/ (기존)
```

---

### Task 1: git 초기화 + 모노레포 골격

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`

- [ ] **Step 1: git 초기화**

```bash
cd /Users/shinsanghoon/workspace/BabeLoop
git init -b main
```

- [ ] **Step 2: 루트 package.json 작성**

```json
{
  "name": "babe-loop",
  "private": true,
  "packageManager": "pnpm@10.4.1",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev:server": "pnpm --filter @babeloop/server start:dev",
    "dev:web": "pnpm --filter @babeloop/web dev",
    "build": "pnpm --filter @babeloop/web build && rm -rf apps/server/public && cp -R apps/web/dist apps/server/public && pnpm --filter @babeloop/server build",
    "start": "node apps/server/dist/main.js",
    "test": "pnpm --filter @babeloop/server test",
    "e2e": "playwright test -c e2e/playwright.config.ts",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "devDependencies": {
    "prisma": "^6.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "@playwright/test": "^1.50.0"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```

- [ ] **Step 3: pnpm-workspace.yaml 작성**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: tsconfig.base.json 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: .gitignore 작성**

```
node_modules/
dist/
.env
apps/server/public/
apps/server/src/generated/
apps/web/src/generated/
apps/web/dist/
e2e/test-results/
e2e/playwright-report/
*.tsbuildinfo
```

- [ ] **Step 6: .env.example 작성**

```
NODE_ENV=development
PORT=3000
APP_BASE_URL=http://localhost:3000

DATABASE_URL=postgresql://babeloop:babeloop@localhost:5432/babeloop
REDIS_URL=redis://localhost:6379

SESSION_SECRET=change-me-to-a-long-random-string

OBJECT_STORAGE_ENDPOINT=http://localhost:9000
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_BUCKET=babeloop
OBJECT_STORAGE_ACCESS_KEY=babeloop
OBJECT_STORAGE_SECRET_KEY=babeloop-secret

ADMIN_EMAIL=admin@babeloop.local
ADMIN_PASSWORD=changeme-admin
```

- [ ] **Step 7: packages/shared 골격 작성**

`packages/shared/package.json`:
```json
{
  "name": "@babeloop/shared",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

`packages/shared/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/shared/src/index.ts`:
```typescript
export const LOCALES = ['ko-KR', 'zh-TW', 'zh-CN', 'en-US', 'ja-JP'] as const;
export type Locale = (typeof LOCALES)[number];

export const USER_ROLES = ['ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER'] as const;
export type UserRole = (typeof USER_ROLES)[number];
```

- [ ] **Step 8: 설치 확인**

Run: `cp .env.example .env && pnpm install`
Expected: 오류 없이 완료, `pnpm-lock.yaml` 생성

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: pnpm 모노레포 골격 및 공통 패키지 초기화"
```

---

### Task 2: Docker Compose 인프라

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: docker-compose.yml 작성**

api/worker/scheduler 컨테이너는 배포 슬라이스가 아니므로 아직 넣지 않는다. 로컬 개발은 호스트에서 `pnpm dev:server`로 실행한다.

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_USER: babeloop
      POSTGRES_PASSWORD: babeloop
      POSTGRES_DB: babeloop
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U babeloop"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: babeloop
      MINIO_ROOT_PASSWORD: babeloop-secret
    ports: ["9000:9000", "9001:9001"]
    volumes: [miniodata:/data]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
  miniodata:
```

- [ ] **Step 2: 기동 확인**

Run: `docker compose up -d && sleep 10 && docker compose ps`
Expected: postgres, redis, minio 모두 `healthy`

- [ ] **Step 3: pgvector 확장 확인**

Run: `docker compose exec postgres psql -U babeloop -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extname FROM pg_extension WHERE extname='vector';"`
Expected: `vector` 1행 출력

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: postgres(pgvector)·redis·minio Docker Compose 구성"
```

---

### Task 3: Prisma 스키마 + 마이그레이션 + 시드

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`

- [ ] **Step 1: schema.prisma 작성**

설계 문서 6장의 슬라이스 0 테이블만. pgvector 확장은 지금 활성화해 둔다(슬라이스 2에서 사용).

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../apps/server/src/generated/prisma"
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

enum UserRole {
  ADMIN
  EDITOR
  REVIEWER
  VIEWER
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  displayName  String
  role         UserRole
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("users")
}

model Brand {
  id          String           @id @default(cuid())
  name        String
  serviceUrl  String?
  description String?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  features    BrandFeature[]
  guidelines  BrandGuideline[]

  @@map("brands")
}

model BrandFeature {
  id          String   @id @default(cuid())
  brandId     String
  brand       Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)
  name        String
  description String
  createdAt   DateTime @default(now())

  @@map("brand_features")
}

model BrandGuideline {
  id        String   @id @default(cuid())
  brandId   String
  brand     Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)
  title     String
  content   String
  createdAt DateTime @default(now())

  @@map("brand_guidelines")
}

model Market {
  id            String   @id @default(cuid())
  code          String   @unique // 예: TW
  name          String
  defaultLocale String   // 예: zh-TW
  locales       String[]
  createdAt     DateTime @default(now())

  @@map("markets")
}

enum AiExecutionStatus {
  SUCCESS
  FAILURE
}

model AiExecutionLog {
  id              String            @id @default(cuid())
  provider        String
  model           String
  promptTemplate  String?
  promptVersion   String?
  inputRef        String? // 입력 데이터를 가리키는 참조 (예: "mediaAsset:abc123")
  status          AiExecutionStatus
  output          Json?
  errorMessage    String?
  inputTokens     Int?
  outputTokens    Int?
  latencyMs       Int
  costEstimateUsd Decimal?          @db.Decimal(10, 6)
  createdAt       DateTime          @default(now())

  @@index([provider, model])
  @@index([status])
  @@map("ai_execution_logs")
}
```

- [ ] **Step 2: extensions 프리뷰 기능 확인**

`datasource`의 `extensions`는 Prisma의 `postgresqlExtensions` 프리뷰 기능이 필요하다. generator에 추가:

```prisma
generator client {
  provider        = "prisma-client-js"
  output          = "../apps/server/src/generated/prisma"
  previewFeatures = ["postgresqlExtensions"]
}
```

- [ ] **Step 3: 마이그레이션 실행**

Run: `pnpm prisma migrate dev --name slice0-init`
Expected: 마이그레이션 생성·적용, Prisma Client가 `apps/server/src/generated/prisma`에 생성됨

- [ ] **Step 4: seed.ts 작성**

```typescript
import 'dotenv/config';
import { PrismaClient } from '../apps/server/src/generated/prisma';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@babeloop.local';
  const password = process.env.ADMIN_PASSWORD ?? 'changeme-admin';

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await argon2.hash(password),
      displayName: 'Admin',
      role: 'ADMIN',
    },
  });

  await prisma.market.upsert({
    where: { code: 'TW' },
    update: {},
    create: {
      code: 'TW',
      name: '대만',
      defaultLocale: 'zh-TW',
      locales: ['zh-TW'],
    },
  });

  console.log('seed done:', email, '+ market TW');
}

main().finally(() => prisma.$disconnect());
```

argon2와 dotenv를 루트 devDependencies에 추가: `pnpm add -D -w argon2 dotenv`

- [ ] **Step 5: 시드 실행 확인**

Run: `pnpm prisma:seed`
Expected: `seed done: admin@babeloop.local + market TW`

Run: `docker compose exec postgres psql -U babeloop -c "SELECT email, role FROM users; SELECT code, default_locale FROM markets;"`
Expected: admin 1행 (ADMIN), TW 1행 — 주의: Prisma 기본 매핑은 camelCase 컬럼이므로 실제 컬럼명은 `"defaultLocale"`. 확인 쿼리는 `SELECT code FROM markets;`로 충분.

- [ ] **Step 6: Commit**

```bash
git add prisma/ pnpm-lock.yaml package.json
git commit -m "feat: 슬라이스 0 Prisma 스키마·마이그레이션·시드 (User/Brand/Market/AiExecutionLog)"
```

---

### Task 4: NestJS 서버 골격 + env 검증 + health

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/nest-cli.json`, `apps/server/src/main.ts`, `apps/server/src/app.module.ts`, `apps/server/src/common/env.validation.ts`, `apps/server/src/health/health.controller.ts`, `apps/server/src/common/prisma/prisma.module.ts`, `apps/server/src/common/prisma/prisma.service.ts`

- [ ] **Step 1: apps/server/package.json 작성**

```json
{
  "name": "@babeloop/server",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start:dev": "nest start --watch",
    "start": "node dist/main.js",
    "test": "jest"
  },
  "dependencies": {
    "@apollo/server": "^4.11.0",
    "@babeloop/shared": "workspace:*",
    "@nestjs/apollo": "^13.0.0",
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/graphql": "^13.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/serve-static": "^5.0.0",
    "@prisma/client": "^6.3.0",
    "argon2": "^0.41.0",
    "connect-redis": "^8.0.0",
    "express-session": "^1.18.0",
    "graphql": "^16.10.0",
    "ioredis": "^5.4.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@testcontainers/postgresql": "^10.16.0",
    "@testcontainers/redis": "^10.16.0",
    "@types/express-session": "^1.18.0",
    "@types/jest": "^29.5.0",
    "@types/supertest": "^6.0.0",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.0"
  }
}
```

- [ ] **Step 2: tsconfig / nest-cli 작성**

`apps/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./dist",
    "baseUrl": "./",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false
  },
  "include": ["src", "test"]
}
```

`apps/server/nest-cli.json`:
```json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

- [ ] **Step 3: env 검증 작성 (Zod, 실패 시 부팅 중단)**

`apps/server/src/common/env.validation.ts`:
```typescript
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`환경변수 검증 실패:\n${result.error.toString()}`);
  }
  return result.data;
}
```

- [ ] **Step 4: PrismaService 작성**

`apps/server/src/common/prisma/prisma.service.ts`:
```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`apps/server/src/common/prisma/prisma.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

- [ ] **Step 5: health controller + app.module + main.ts 작성**

`apps/server/src/health/health.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  }
}
```

`apps/server/src/app.module.ts` (GraphQL은 Task 5에서 추가):
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

`apps/server/src/main.ts`:
```typescript
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API listening on :${port}`);
}
bootstrap();
```

`dotenv`를 server dependencies에 추가한다.

- [ ] **Step 6: 부팅 확인**

Run: `pnpm install && pnpm --filter @babeloop/server start:dev` (백그라운드) 후 `curl -s localhost:3000/health && curl -s localhost:3000/ready`
Expected: `{"status":"ok"}` `{"status":"ready"}`

- [ ] **Step 7: env 검증 동작 확인**

Run: `.env`의 `SESSION_SECRET` 값을 8자(예: `tooshort`)로 임시 변경 → 서버 재시작
Expected: "환경변수 검증 실패" 오류와 함께 부팅 중단. 확인 후 원래 값으로 복원.

- [ ] **Step 8: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "feat: NestJS 서버 골격 — env Zod 검증, Prisma 모듈, health/ready"
```

---

### Task 5: 세션 미들웨어 + GraphQL 부트스트랩

**Files:**
- Create: `apps/server/src/common/session/session.middleware.ts`
- Modify: `apps/server/src/app.module.ts`, `apps/server/src/main.ts`

- [ ] **Step 1: 세션 미들웨어 작성 (main.ts와 테스트가 공유)**

`apps/server/src/common/session/session.middleware.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import Redis from 'ioredis';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

export function applySessionMiddleware(app: INestApplication): void {
  const redisClient = new Redis(process.env.REDIS_URL!);
  app.use(
    session({
      store: new RedisStore({ client: redisClient }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7일
      },
    }),
  );
}
```

- [ ] **Step 2: GraphQL 모듈 등록 (Code First)**

`apps/server/src/app.module.ts`의 imports에 추가:
```typescript
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'path';

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: join(__dirname, '..', 'src', 'generated', 'schema.gql'),
  sortSchema: true,
  playground: process.env.NODE_ENV !== 'production',
  context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
}),
```

주의: 경로는 `process.cwd()`가 아니라 `__dirname` 기준이어야 한다. 컴파일 후 `__dirname`은 `apps/server/dist`이므로 `../src/generated/schema.gql`은 실행 위치(루트에서 `pnpm start`든, `apps/server`에서 `nest start`든)와 무관하게 항상 `apps/server/src/generated/schema.gql`을 가리킨다. web codegen이 이 파일을 읽는다.

- [ ] **Step 3: main.ts에 세션 적용**

`bootstrap()` 안 `NestFactory.create` 직후에:
```typescript
applySessionMiddleware(app);
```

- [ ] **Step 4: 부팅 확인 — GraphQL 스키마는 Query가 하나도 없으면 생성 실패하므로, Task 6의 auth resolver까지 이 시점에서는 서버 기동 확인을 미룬다. 컴파일만 확인:**

Run: `pnpm --filter @babeloop/server build`
Expected: 컴파일 성공 (GraphQL 모듈은 등록만 된 상태)

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat: Redis 세션 미들웨어 및 GraphQL Code First 부트스트랩"
```

---

### Task 6: 인증 모듈 (login / logout / me + 역할 Guard)

**Files:**
- Create: `apps/server/src/common/errors.ts`
- Create: `apps/server/src/modules/auth/user.model.ts`, `auth.service.ts`, `auth.resolver.ts`, `gql-auth.guard.ts`, `roles.decorator.ts`, `roles.guard.ts`, `current-user.decorator.ts`, `auth.module.ts`
- Create: `apps/server/test/create-test-app.ts`, `apps/server/test/auth.e2e-spec.ts`, `apps/server/jest.config.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: jest 설정 작성**

`apps/server/jest.config.ts`:
```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
  testTimeout: 120_000, // Testcontainers 기동 시간 포함
  maxWorkers: 1, // 컨테이너 공유 충돌 방지
};
export default config;
```

- [ ] **Step 2: Testcontainers 헬퍼 작성 — 이후 모든 통합 테스트의 원본 패턴**

`apps/server/test/create-test-app.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { execSync } from 'child_process';
import * as path from 'path';

let pg: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

export interface TestApp {
  app: INestApplication;
  teardown: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  if (!pg) {
    pg = await new PostgreSqlContainer('pgvector/pgvector:pg17').start();
    redis = await new RedisContainer('redis:7-alpine').start();
    process.env.DATABASE_URL = pg.getConnectionUri();
    process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    process.env.SESSION_SECRET = 'test-session-secret-0123456789';
    process.env.APP_BASE_URL = 'http://localhost:3000';
    process.env.NODE_ENV = 'test';
    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '../../..'),
      env: process.env,
      stdio: 'inherit',
    });
  }

  // AppModule은 환경변수 세팅 이후에 import해야 한다
  const { AppModule } = await import('../src/app.module');
  const { applySessionMiddleware } = await import('../src/common/session/session.middleware');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  applySessionMiddleware(app);
  await app.init();

  return {
    app,
    teardown: async () => {
      await app.close();
    },
  };
}

export async function stopContainers(): Promise<void> {
  await pg?.stop();
  await redis?.stop();
  pg = undefined;
  redis = undefined;
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

`apps/server/test/auth.e2e-spec.ts`:
```typescript
import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, stopContainers, TestApp } from './create-test-app';

const LOGIN = `mutation Login($email: String!, $password: String!) {
  login(email: $email, password: $password) { id email role }
}`;
const ME = `query { me { id email role } }`;

describe('auth', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    const prisma = t.app.get(PrismaService);
    await prisma.user.upsert({
      where: { email: 'editor@test.local' },
      update: {},
      create: {
        email: 'editor@test.local',
        passwordHash: await argon2.hash('pw-editor-123'),
        displayName: 'Editor',
        role: 'EDITOR',
      },
    });
  });

  afterAll(async () => {
    await t.teardown();
    await stopContainers();
  });

  it('올바른 자격으로 로그인하면 유저를 반환하고 세션이 생긴다', async () => {
    const agent = request.agent(t.app.getHttpServer());
    const res = await agent.post('/graphql').send({
      query: LOGIN,
      variables: { email: 'editor@test.local', password: 'pw-editor-123' },
    });
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.login.email).toBe('editor@test.local');

    const meRes = await agent.post('/graphql').send({ query: ME });
    expect(meRes.body.data.me.role).toBe('EDITOR');
  });

  it('틀린 비밀번호는 UNAUTHENTICATED 오류', async () => {
    const res = await request(t.app.getHttpServer()).post('/graphql').send({
      query: LOGIN,
      variables: { email: 'editor@test.local', password: 'wrong' },
    });
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('로그인 없이 me를 조회하면 UNAUTHENTICATED 오류', async () => {
    const res = await request(t.app.getHttpServer()).post('/graphql').send({ query: ME });
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `pnpm --filter @babeloop/server test -- auth`
Expected: FAIL — `login` 필드가 스키마에 없음

- [ ] **Step 5: 인증 모듈 구현**

`apps/server/src/modules/auth/user.model.ts`:
```typescript
import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { UserRole } from '../../generated/prisma';

registerEnumType(UserRole, { name: 'UserRole' });

@ObjectType()
export class UserModel {
  @Field(() => ID) id: string;
  @Field() email: string;
  @Field() displayName: string;
  @Field(() => UserRole) role: UserRole;
}
```

먼저 GraphQL 오류 표준화 헬퍼를 만든다 (스펙 11장 "GraphQL 오류 표준화"). NestJS 예외가 Apollo에서 어떤 `extensions.code`로 매핑되는지는 버전에 따라 다르므로, 코드를 명시한 `GraphQLError`를 직접 던져 결정적으로 만든다.

`apps/server/src/common/errors.ts` (Create):
```typescript
import { GraphQLError } from 'graphql';

export function unauthenticated(message = '로그인이 필요합니다'): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'UNAUTHENTICATED' } });
}

export function forbidden(message = '이 작업을 수행할 권한이 없습니다'): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'FORBIDDEN' } });
}
```

`apps/server/src/modules/auth/auth.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { unauthenticated } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { User } from '../../generated/prisma';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw unauthenticated('이메일 또는 비밀번호가 올바르지 않습니다');
    }
    return user;
  }
}
```

`apps/server/src/modules/auth/gql-auth.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { unauthenticated } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = GqlExecutionContext.create(ctx).getContext().req;
    const userId = req.session?.userId;
    if (!userId) throw unauthenticated();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthenticated();
    req.user = user;
    return true;
  }
}
```

`apps/server/src/modules/auth/roles.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../generated/prisma';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

`apps/server/src/modules/auth/roles.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { forbidden } from '../../common/errors';
import { UserRole } from '../../generated/prisma';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = GqlExecutionContext.create(ctx).getContext().req;
    if (!required.includes(req.user?.role)) {
      throw forbidden();
    }
    return true;
  }
}
```

`apps/server/src/modules/auth/current-user.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return GqlExecutionContext.create(ctx).getContext().req.user;
});
```

`apps/server/src/modules/auth/auth.resolver.ts`:
```typescript
import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { User } from '../../generated/prisma';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { GqlAuthGuard } from './gql-auth.guard';
import { UserModel } from './user.model';

@Resolver(() => UserModel)
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => UserModel)
  async login(
    @Args('email') email: string,
    @Args('password') password: string,
    @Context('req') req: { session: { userId?: string } },
  ): Promise<User> {
    const user = await this.authService.validateCredentials(email, password);
    req.session.userId = user.id;
    return user;
  }

  @Mutation(() => Boolean)
  async logout(@Context('req') req: { session: { destroy: (cb: () => void) => void } }): Promise<boolean> {
    await new Promise<void>((resolve) => req.session.destroy(resolve));
    return true;
  }

  @Query(() => UserModel)
  @UseGuards(GqlAuthGuard)
  me(@CurrentUser() user: User): User {
    return user;
  }
}
```

`apps/server/src/modules/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { GqlAuthGuard } from './gql-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  providers: [AuthService, AuthResolver, GqlAuthGuard, RolesGuard],
  exports: [GqlAuthGuard, RolesGuard],
})
export class AuthModule {}
```

`app.module.ts` imports에 `AuthModule` 추가.

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm --filter @babeloop/server test -- auth`
Expected: PASS 3건

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat: 세션 기반 인증 — login/logout/me, 역할 Guard, Testcontainers 통합 테스트"
```

---

### Task 7: 시장(Market) 모듈

**Files:**
- Create: `apps/server/src/modules/market/market.model.ts`, `market.service.ts`, `market.resolver.ts`, `market.module.ts`
- Create: `apps/server/test/market.e2e-spec.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/test/market.e2e-spec.ts`:
```typescript
import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, stopContainers, TestApp } from './create-test-app';

const MARKETS = `query { markets { code name defaultLocale locales } }`;

describe('market', () => {
  let t: TestApp;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    t = await createTestApp();
    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    const prisma = t.app.get(PrismaService);
    await prisma.market.upsert({
      where: { code: 'TW' },
      update: {},
      create: { code: 'TW', name: '대만', defaultLocale: 'zh-TW', locales: ['zh-TW'] },
    });
    await prisma.user.upsert({
      where: { email: 'viewer@test.local' },
      update: {},
      create: {
        email: 'viewer@test.local',
        passwordHash: await argon2.hash('pw-viewer-123'),
        displayName: 'Viewer',
        role: 'VIEWER',
      },
    });
    agent = request.agent(t.app.getHttpServer());
    await agent.post('/graphql').send({
      query: `mutation { login(email: "viewer@test.local", password: "pw-viewer-123") { id } }`,
    });
  });

  afterAll(async () => {
    await t.teardown();
    await stopContainers();
  });

  it('로그인한 사용자는 시장 목록을 조회할 수 있다', async () => {
    const res = await agent.post('/graphql').send({ query: MARKETS });
    expect(res.body.errors).toBeUndefined();
    const tw = res.body.data.markets.find((m: { code: string }) => m.code === 'TW');
    expect(tw.defaultLocale).toBe('zh-TW');
  });

  it('비로그인 사용자는 조회할 수 없다', async () => {
    const res = await request(t.app.getHttpServer()).post('/graphql').send({ query: MARKETS });
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @babeloop/server test -- market`
Expected: FAIL — `markets` 필드 없음

- [ ] **Step 3: 구현**

`apps/server/src/modules/market/market.model.ts`:
```typescript
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class MarketModel {
  @Field(() => ID) id: string;
  @Field() code: string;
  @Field() name: string;
  @Field() defaultLocale: string;
  @Field(() => [String]) locales: string[];
}
```

`apps/server/src/modules/market/market.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.market.findMany({ orderBy: { code: 'asc' } });
  }
}
```

`apps/server/src/modules/market/market.resolver.ts`:
```typescript
import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { MarketModel } from './market.model';
import { MarketService } from './market.service';

@Resolver(() => MarketModel)
@UseGuards(GqlAuthGuard)
export class MarketResolver {
  constructor(private readonly marketService: MarketService) {}

  @Query(() => [MarketModel])
  markets() {
    return this.marketService.findAll();
  }
}
```

`apps/server/src/modules/market/market.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MarketResolver } from './market.resolver';
import { MarketService } from './market.service';

@Module({ imports: [AuthModule], providers: [MarketService, MarketResolver] })
export class MarketModule {}
```

`app.module.ts` imports에 `MarketModule` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @babeloop/server test -- market`
Expected: PASS 2건

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat: 시장 목록 조회 GraphQL"
```

---

### Task 8: 브랜드 모듈 (등록·수정·조회 + 역할 검사)

**Files:**
- Create: `apps/server/src/modules/brand/brand.models.ts`, `brand.inputs.ts`, `brand.service.ts`, `brand.resolver.ts`, `brand.module.ts`
- Create: `apps/server/test/brand.e2e-spec.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/test/brand.e2e-spec.ts`:
```typescript
import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, stopContainers, TestApp } from './create-test-app';

const CREATE_BRAND = `mutation Create($input: CreateBrandInput!) {
  createBrand(input: $input) { id name serviceUrl features { name description } }
}`;
const BRANDS = `query { brands { id name features { name } } }`;

async function loginAs(t: TestApp, email: string, role: 'EDITOR' | 'VIEWER') {
  const { PrismaService } = await import('../src/common/prisma/prisma.service');
  const prisma = t.app.get(PrismaService);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: await argon2.hash('pw-123456'), displayName: role, role },
  });
  const agent = request.agent(t.app.getHttpServer());
  await agent.post('/graphql').send({
    query: `mutation { login(email: "${email}", password: "pw-123456") { id } }`,
  });
  return agent;
}

describe('brand', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.teardown();
    await stopContainers();
  });

  it('EDITOR는 기능 목록과 함께 브랜드를 등록할 수 있다', async () => {
    const agent = await loginAs(t, 'editor2@test.local', 'EDITOR');
    const res = await agent.post('/graphql').send({
      query: CREATE_BRAND,
      variables: {
        input: {
          name: 'BabeChat',
          serviceUrl: 'https://www.babechat.ai',
          features: [{ name: '캐릭터 생성', description: '직접 캐릭터와 세계관을 만든다' }],
        },
      },
    });
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.createBrand.name).toBe('BabeChat');
    expect(res.body.data.createBrand.features).toHaveLength(1);

    const list = await agent.post('/graphql').send({ query: BRANDS });
    expect(list.body.data.brands.some((b: { name: string }) => b.name === 'BabeChat')).toBe(true);
  });

  it('VIEWER는 브랜드를 등록할 수 없다 (FORBIDDEN)', async () => {
    const agent = await loginAs(t, 'viewer2@test.local', 'VIEWER');
    const res = await agent.post('/graphql').send({
      query: CREATE_BRAND,
      variables: { input: { name: 'X', features: [] } },
    });
    expect(res.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @babeloop/server test -- brand`
Expected: FAIL — `createBrand` 없음

- [ ] **Step 3: 구현**

`apps/server/src/modules/brand/brand.models.ts`:
```typescript
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class BrandFeatureModel {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() description: string;
}

@ObjectType()
export class BrandGuidelineModel {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field() content: string;
}

@ObjectType()
export class BrandModel {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => String, { nullable: true }) serviceUrl: string | null;
  @Field(() => String, { nullable: true }) description: string | null;
  @Field(() => [BrandFeatureModel]) features: BrandFeatureModel[];
  @Field(() => [BrandGuidelineModel]) guidelines: BrandGuidelineModel[];
}
```

`apps/server/src/modules/brand/brand.inputs.ts`:
```typescript
import { Field, ID, InputType } from '@nestjs/graphql';

@InputType()
export class BrandFeatureInput {
  @Field() name: string;
  @Field() description: string;
}

@InputType()
export class CreateBrandInput {
  @Field() name: string;
  @Field(() => String, { nullable: true }) serviceUrl?: string;
  @Field(() => String, { nullable: true }) description?: string;
  @Field(() => [BrandFeatureInput], { defaultValue: [] }) features: BrandFeatureInput[];
}

@InputType()
export class UpdateBrandInput {
  @Field(() => ID) id: string;
  @Field(() => String, { nullable: true }) name?: string;
  @Field(() => String, { nullable: true }) serviceUrl?: string;
  @Field(() => String, { nullable: true }) description?: string;
}
```

`apps/server/src/modules/brand/brand.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBrandInput, UpdateBrandInput } from './brand.inputs';

const BRAND_INCLUDE = { features: true, guidelines: true } as const;

@Injectable()
export class BrandService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.brand.findMany({ include: BRAND_INCLUDE, orderBy: { createdAt: 'asc' } });
  }

  async findById(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id }, include: BRAND_INCLUDE });
    if (!brand) throw new NotFoundException('브랜드를 찾을 수 없습니다');
    return brand;
  }

  create(input: CreateBrandInput) {
    return this.prisma.brand.create({
      data: {
        name: input.name,
        serviceUrl: input.serviceUrl,
        description: input.description,
        features: { create: input.features },
      },
      include: BRAND_INCLUDE,
    });
  }

  async update(input: UpdateBrandInput) {
    await this.findById(input.id);
    return this.prisma.brand.update({
      where: { id: input.id },
      data: { name: input.name ?? undefined, serviceUrl: input.serviceUrl, description: input.description },
      include: BRAND_INCLUDE,
    });
  }
}
```

`apps/server/src/modules/brand/brand.resolver.ts`:
```typescript
import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateBrandInput, UpdateBrandInput } from './brand.inputs';
import { BrandModel } from './brand.models';
import { BrandService } from './brand.service';

@Resolver(() => BrandModel)
@UseGuards(GqlAuthGuard, RolesGuard)
export class BrandResolver {
  constructor(private readonly brandService: BrandService) {}

  @Query(() => [BrandModel])
  brands() {
    return this.brandService.findAll();
  }

  @Query(() => BrandModel)
  brand(@Args('id', { type: () => ID }) id: string) {
    return this.brandService.findById(id);
  }

  @Mutation(() => BrandModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  createBrand(@Args('input') input: CreateBrandInput) {
    return this.brandService.create(input);
  }

  @Mutation(() => BrandModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  updateBrand(@Args('input') input: UpdateBrandInput) {
    return this.brandService.update(input);
  }
}
```

`apps/server/src/modules/brand/brand.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BrandResolver } from './brand.resolver';
import { BrandService } from './brand.service';

@Module({ imports: [AuthModule], providers: [BrandService, BrandResolver] })
export class BrandModule {}
```

`app.module.ts` imports에 `BrandModule` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @babeloop/server test -- brand`
Expected: PASS 2건

- [ ] **Step 5: 전체 서버 테스트 회귀 확인**

Run: `pnpm --filter @babeloop/server test`
Expected: auth 3건 + market 2건 + brand 2건 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat: 브랜드 등록·수정·조회 GraphQL 및 역할 기반 접근 제어"
```

---

### Task 9: AiExecutionLogService — 모든 AI 호출의 공통 관문

**Files:**
- Create: `apps/server/src/modules/ai-log/ai-execution-log.service.ts`, `ai-log.module.ts`, `apps/server/src/modules/ai-log/ai-execution-log.service.spec.ts`
- Modify: `apps/server/src/app.module.ts`

이후 슬라이스의 모든 AI Provider 호출은 `record()` 래퍼를 통과한다. 성공뿐 아니라 **실패도 기록**하는 것이 존재 이유다 (설계 문서 4장).

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`apps/server/src/modules/ai-log/ai-execution-log.service.spec.ts`:
```typescript
import { AiExecutionLogService } from './ai-execution-log.service';

describe('AiExecutionLogService', () => {
  const createMock = jest.fn().mockResolvedValue({});
  const prisma = { aiExecutionLog: { create: createMock } };
  const service = new AiExecutionLogService(prisma as never);

  beforeEach(() => createMock.mockClear());

  it('성공 시 SUCCESS와 결과를 기록하고 결과를 반환한다', async () => {
    const result = await service.record(
      { provider: 'mock', model: 'mock-1', inputRef: 'test:1' },
      async () => ({ answer: 42 }),
    );
    expect(result).toEqual({ answer: 42 });
    const data = createMock.mock.calls[0][0].data;
    expect(data.status).toBe('SUCCESS');
    expect(data.output).toEqual({ answer: 42 });
    expect(typeof data.latencyMs).toBe('number');
  });

  it('실패 시 FAILURE와 오류 메시지를 기록하고 오류를 다시 던진다', async () => {
    await expect(
      service.record({ provider: 'mock', model: 'mock-1' }, async () => {
        throw new Error('provider exploded');
      }),
    ).rejects.toThrow('provider exploded');
    const data = createMock.mock.calls[0][0].data;
    expect(data.status).toBe('FAILURE');
    expect(data.errorMessage).toBe('provider exploded');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @babeloop/server test -- ai-execution-log`
Expected: FAIL — 파일 없음

- [ ] **Step 3: 구현**

`apps/server/src/modules/ai-log/ai-execution-log.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AiExecutionMeta {
  provider: string;
  model: string;
  promptTemplate?: string;
  promptVersion?: string;
  inputRef?: string;
  inputTokens?: number;
  outputTokens?: number;
  costEstimateUsd?: number;
}

@Injectable()
export class AiExecutionLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** AI 호출을 감싸 성공·실패를 모두 기록한다. 실패는 기록 후 다시 던진다. */
  async record<T>(meta: AiExecutionMeta, fn: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await fn();
      await this.write(meta, {
        status: 'SUCCESS',
        output: result as Prisma.InputJsonValue,
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await this.write(meta, {
        status: 'FAILURE',
        errorMessage: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  private async write(
    meta: AiExecutionMeta,
    outcome: {
      status: 'SUCCESS' | 'FAILURE';
      output?: Prisma.InputJsonValue;
      errorMessage?: string;
      latencyMs: number;
    },
  ): Promise<void> {
    try {
      await this.prisma.aiExecutionLog.create({ data: { ...meta, ...outcome } });
    } catch (logError) {
      // 로그 기록 실패가 원래 작업을 죽여서는 안 된다
      console.error('ai_execution_logs 기록 실패:', logError);
    }
  }
}
```

`apps/server/src/modules/ai-log/ai-log.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { AiExecutionLogService } from './ai-execution-log.service';

@Global()
@Module({ providers: [AiExecutionLogService], exports: [AiExecutionLogService] })
export class AiLogModule {}
```

`app.module.ts` imports에 `AiLogModule` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @babeloop/server test -- ai-execution-log`
Expected: PASS 2건

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat: AI 실행 기록 서비스 — 성공·실패 모두 기록하는 record 래퍼"
```

---

### Task 10: Worker / Scheduler 스텁

**Files:**
- Create: `apps/server/src/worker.ts`, `apps/server/src/scheduler.ts`

실행 모드 3분리(설계 문서 2장)의 자리만 잡는다. BullMQ 실작업은 슬라이스 1.

- [ ] **Step 1: worker.ts 작성**

```typescript
import 'dotenv/config';
import Redis from 'ioredis';

async function bootstrap() {
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.ping();
  console.log('worker ready (큐 프로세서는 슬라이스 1에서 등록)');
}
bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: scheduler.ts 작성**

```typescript
import 'dotenv/config';
import Redis from 'ioredis';

async function bootstrap() {
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.ping();
  console.log('scheduler ready (반복 작업은 슬라이스 1에서 등록)');
}
bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: 기동 확인**

Run: `pnpm --filter @babeloop/server build && node apps/server/dist/worker.js`
Expected: `worker ready ...` 출력 (프로세스는 redis 연결 유지로 살아 있음 — Ctrl+C로 종료)

- [ ] **Step 4: Commit**

```bash
git add apps/server
git commit -m "feat: worker·scheduler 실행 모드 스텁"
```

---

### Task 11: React 앱 — 로그인·브랜드 화면

**Files:**
- Create: `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `codegen.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/apollo.ts`, `src/pages/LoginPage.tsx`, `src/pages/BrandsPage.tsx`

GraphQL 문서는 별도 `.graphql` 파일이 아니라 **TS 코드 안의 `graphql()` 태그**(codegen client preset)로 작성하는 것을 표준으로 한다.

- [ ] **Step 1: apps/web/package.json 작성**

```json
{
  "name": "@babeloop/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "pnpm codegen && tsc -b && vite build",
    "codegen": "graphql-codegen --config codegen.ts"
  },
  "dependencies": {
    "@apollo/client": "^3.12.0",
    "@hookform/resolvers": "^3.10.0",
    "graphql": "^16.10.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.54.0",
    "react-router": "^7.1.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@graphql-codegen/cli": "^5.0.0",
    "@graphql-codegen/client-preset": "^4.5.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: 설정 파일 작성**

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "noEmit": true
  },
  "include": ["src"]
}
```

`apps/web/vite.config.ts`:
```typescript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/graphql': 'http://localhost:3000' },
  },
});
```

`apps/web/codegen.ts`:
```typescript
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: '../server/src/generated/schema.gql',
  documents: ['src/**/*.tsx'],
  generates: {
    'src/generated/': { preset: 'client' },
  },
};
export default config;
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BabeLoop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: 앱 코드 작성**

`apps/web/src/apollo.ts`:
```typescript
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';

export const apolloClient = new ApolloClient({
  link: new HttpLink({ uri: '/graphql', credentials: 'same-origin' }),
  cache: new InMemoryCache(),
});
```

`apps/web/src/main.tsx`:
```tsx
import { ApolloProvider } from '@apollo/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { apolloClient } from './apollo';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApolloProvider client={apolloClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ApolloProvider>
  </StrictMode>,
);
```

`apps/web/src/App.tsx`:
```tsx
import { useQuery } from '@apollo/client';
import { Navigate, Route, Routes } from 'react-router';
import { graphql } from './generated';
import { LoginPage } from './pages/LoginPage';
import { BrandsPage } from './pages/BrandsPage';

const MeDocument = graphql(`
  query Me { me { id email displayName role } }
`);

export function App() {
  const { data, loading, refetch } = useQuery(MeDocument, { errorPolicy: 'ignore' });

  if (loading) return <p>로딩 중…</p>;
  const me = data?.me ?? null;

  return (
    <Routes>
      <Route path="/login" element={me ? <Navigate to="/brands" /> : <LoginPage onLogin={() => refetch()} />} />
      <Route path="/brands" element={me ? <BrandsPage /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={me ? '/brands' : '/login'} />} />
    </Routes>
  );
}
```

`apps/web/src/pages/LoginPage.tsx`:
```tsx
import { useMutation } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { graphql } from '../generated';

const LoginDocument = graphql(`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) { id email displayName role }
  }
`);

const schema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(1, '비밀번호를 입력하세요'),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();
  const [login, { error }] = useMutation(LoginDocument);
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    await login({ variables: values });
    onLogin();
    navigate('/brands');
  });

  return (
    <main>
      <h1>BabeLoop 로그인</h1>
      <form onSubmit={onSubmit}>
        <label>
          이메일
          <input type="email" {...register('email')} />
        </label>
        {formState.errors.email && <p role="alert">{formState.errors.email.message}</p>}
        <label>
          비밀번호
          <input type="password" {...register('password')} />
        </label>
        {formState.errors.password && <p role="alert">{formState.errors.password.message}</p>}
        {error && <p role="alert">로그인 실패: 이메일 또는 비밀번호를 확인하세요</p>}
        <button type="submit" disabled={formState.isSubmitting}>로그인</button>
      </form>
    </main>
  );
}
```

`apps/web/src/pages/BrandsPage.tsx`:
```tsx
import { useMutation, useQuery } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { graphql } from '../generated';

const BrandsDocument = graphql(`
  query Brands { brands { id name serviceUrl features { id name } } }
`);

const CreateBrandDocument = graphql(`
  mutation CreateBrand($input: CreateBrandInput!) {
    createBrand(input: $input) { id name }
  }
`);

const schema = z.object({
  name: z.string().min(1, '브랜드명을 입력하세요'),
  serviceUrl: z.string().url('올바른 URL을 입력하세요').optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

export function BrandsPage() {
  const { data, refetch } = useQuery(BrandsDocument);
  const [createBrand] = useMutation(CreateBrandDocument);
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    await createBrand({
      variables: { input: { name: values.name, serviceUrl: values.serviceUrl || null, features: [] } },
    });
    reset();
    await refetch();
  });

  return (
    <main>
      <h1>브랜드</h1>
      <form onSubmit={onSubmit}>
        <label>
          브랜드명
          <input {...register('name')} />
        </label>
        {formState.errors.name && <p role="alert">{formState.errors.name.message}</p>}
        <label>
          서비스 URL
          <input {...register('serviceUrl')} />
        </label>
        <button type="submit" disabled={formState.isSubmitting}>브랜드 등록</button>
      </form>
      <ul>
        {data?.brands.map((b) => (
          <li key={b.id}>
            {b.name} {b.serviceUrl && <span>({b.serviceUrl})</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: codegen 실행 및 타입 확인**

전제: 서버가 한 번 부팅되어 `apps/server/src/generated/schema.gql`이 생성되어 있어야 한다. 없다면 `pnpm dev:server`를 잠깐 띄웠다 내린다.

Run: `pnpm install && pnpm --filter @babeloop/web codegen && pnpm --filter @babeloop/web exec tsc -b`
Expected: `apps/web/src/generated/` 생성, 타입 오류 없음

- [ ] **Step 5: 개발 서버로 수동 확인**

Run: 터미널 1 `pnpm dev:server`, 터미널 2 `pnpm dev:web` → 브라우저에서 `http://localhost:5173`
Expected: 로그인 → admin@babeloop.local / changeme-admin → 브랜드 등록 → 목록 표시

- [ ] **Step 6: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat: React 로그인·브랜드 화면 — Apollo Client, codegen, RHF+Zod"
```

---

### Task 12: ServeStatic — 단일 Origin 서빙

**Files:**
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: ServeStaticModule 등록**

`app.module.ts` imports에 추가:
```typescript
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync } from 'fs';

...(existsSync(join(__dirname, '..', 'public'))
  ? [
      ServeStaticModule.forRoot({
        rootPath: join(__dirname, '..', 'public'),
        exclude: ['/graphql', '/health', '/ready'],
      }),
    ]
  : []),
```

경로는 `__dirname` 기준 — 컴파일 후 `apps/server/dist`에서 `../public`은 실행 위치와 무관하게 `apps/server/public`을 가리킨다. `public/`이 없으면(개발 모드) 등록하지 않는다 — 개발은 Vite dev server + proxy를 쓴다. `/webhooks` `/oauth`는 해당 경로가 생기는 슬라이스에서 exclude에 추가한다.

- [ ] **Step 2: 통합 빌드 및 확인**

Run: `pnpm build && pnpm start` 후 브라우저에서 `http://localhost:3000`
Expected: React 앱이 뜨고 로그인 → 브랜드 등록 → 목록이 같은 Origin에서 동작. `curl -s localhost:3000/health`도 여전히 `{"status":"ok"}`. `http://localhost:3000/brands` 직접 접근(새로고침)도 index.html로 fallback되어 동작.

- [ ] **Step 3: Commit**

```bash
git add apps/server
git commit -m "feat: NestJS가 React 정적 빌드를 단일 Origin으로 서빙"
```

---

### Task 13: Playwright E2E — 슬라이스 0 완료 기준

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/slice0.spec.ts`

- [ ] **Step 1: Playwright 설정 작성**

전제: docker compose 인프라 기동 + 시드 완료 상태에서 실행한다.

`e2e/playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'pnpm build && pnpm start',
    cwd: '..',
    url: 'http://localhost:3000/health',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
```

- [ ] **Step 2: E2E 테스트 작성**

`e2e/slice0.spec.ts`:
```typescript
import { expect, test } from '@playwright/test';

test('로그인 → 브랜드 등록 → 목록 표시', async ({ page }) => {
  const brandName = `BabeChat-${Date.now()}`;

  await page.goto('/');
  await page.getByLabel('이메일').fill('admin@babeloop.local');
  await page.getByLabel('비밀번호').fill('changeme-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page.getByRole('heading', { name: '브랜드' })).toBeVisible();

  await page.getByLabel('브랜드명').fill(brandName);
  await page.getByLabel('서비스 URL').fill('https://www.babechat.ai');
  await page.getByRole('button', { name: '브랜드 등록' }).click();

  await expect(page.getByText(brandName)).toBeVisible();
});
```

- [ ] **Step 3: 실행 확인**

Run: `npx playwright install chromium` (최초 1회) 후 `pnpm e2e`
Expected: 1 passed

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test: 슬라이스 0 완료 기준 E2E — 로그인·브랜드 등록·목록"
```

---

### Task 14: README — 실행 방법 문서화

**Files:**
- Create: `README.md`

- [ ] **Step 1: README.md 작성**

```markdown
# BabeLoop

BabeChat 마케팅 자동화 플랫폼. 기획: `PROJECT_SPEC.md`, 설계: `docs/superpowers/specs/2026-07-14-babeloop-design.md`

## 요구사항

- Node 22+, pnpm 10+, Docker

## 시작하기

​```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm prisma:migrate
pnpm prisma:seed          # admin@babeloop.local / changeme-admin
​```

## 개발

​```bash
pnpm dev:server           # NestJS :3000 (GraphQL Playground /graphql)
pnpm dev:web              # Vite :5173 (API는 :3000으로 프록시)
​```

## 프로덕션 모드 (단일 Origin)

​```bash
pnpm build && pnpm start  # React 정적 빌드를 NestJS가 :3000에서 서빙
​```

## 테스트

​```bash
pnpm test                 # 서버 단위·통합 (Testcontainers — Docker 필요)
pnpm e2e                  # Playwright (인프라 기동 + 시드 완료 상태에서)
​```
```

(코드펜스의 `​` 이스케이프는 실제 파일에서는 일반 백틱 3개로 작성한다.)

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: 실행 방법 README"
```

---

## 슬라이스 0 완료 체크리스트

전부 만족해야 슬라이스 1 계획 작성으로 넘어간다:

- [ ] `docker compose up -d` → 3개 서비스 healthy
- [ ] `pnpm test` → 서버 테스트 전부 PASS (auth 3, market 2, brand 2, ai-log 2)
- [ ] `pnpm e2e` → 1 passed
- [ ] `pnpm build && pnpm start` → 단일 Origin에서 로그인·브랜드 등록 동작, `/brands` 새로고침 fallback 동작
- [ ] `.env` 검증 실패 시 부팅 중단 확인
- [ ] worker/scheduler 스텁 기동 확인

## 다음 슬라이스 예고 (계획은 슬라이스 0 검증 후 작성)

슬라이스 1: Presigned 업로드(MinIO), MediaAsset, BullMQ 첫 큐(media-processing), Mock OCR/전사, GraphQL `Job` 타입 + 프런트 폴링 훅. 이 슬라이스에서 확립될 패턴: 큐 프로세서 구조, idempotent jobId 규칙, Job 폴링 UI.

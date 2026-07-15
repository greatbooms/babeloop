# BabeLoop 슬라이스 1 (업로드 파이프라인) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미지/영상 파일을 Presigned URL로 MinIO에 직접 업로드 → BullMQ 워커가 Mock OCR/전사 실행 → 프런트가 Job을 폴링해 결과 표시. 비동기 파이프라인 전체(스토리지→큐→워커→AI Provider→폴링 UI)를 관통 검증한다.

**Architecture:** API 프로세스는 Presigned URL 발급과 큐 등록만, 실제 처리는 Worker 프로세스(BullMQ)가 담당. 모든 AI 호출은 `AiExecutionLogService.record()`를 통과. 작업 상태는 `jobs` 테이블에 미러링되고 GraphQL `job(id)` 폴링 하나로만 노출된다 (설계 문서 10장).

**Tech Stack (추가분):** @nestjs/bullmq + bullmq, @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner (MinIO는 S3 호환, `forcePathStyle: true`).

**참조:** `docs/superpowers/specs/2026-07-14-babeloop-design.md`, 슬라이스 0 코드 (패턴의 원본)

---

**설계 문서와의 차이:** 설계 문서 6장의 슬라이스 1 테이블 목록 중 `media_variants`는 이번에 만들지 않는다 — 썸네일·비율 변환(FFmpeg)이 들어오는 슬라이스에서 함께 추가한다 (YAGNI).

## 슬라이스 0 검증에서 배운 환경 제약 (반드시 지킬 것)

1. **pnpm은 corepack으로 활성화되어 있다** (`corepack enable pnpm`). 전역 설치 아님.
2. **호스트 포트**: postgres 5433, redis 6380 (grip 프로젝트와 충돌 회피). `.env`가 이미 반영됨 — 변경 금지.
3. **Apollo Server 5 + @as-integrations/express5** 조합이다. `playground` 옵션 사용 금지 (AS5가 비프로덕션에서 Sandbox 기본 제공).
4. **Prisma Client는 `apps/server/generated/prisma`** (src 밖). 새 코드의 임포트 깊이 주의: `src/x/y/` 파일에서 `'../../../generated/prisma'`.
5. **새 Resolver를 만들면 `apps/server/src/generate-schema.ts`의 resolver 목록에 반드시 추가** — 빠뜨리면 web codegen이 새 타입을 못 본다.
6. **jest는 열린 핸들이 남으면 영원히 종료되지 않는다** (슬라이스 0에서 39분 행의 원인). BullMQ Queue/Worker, ioredis, Nest 컨텍스트는 테스트 teardown에서 전부 close할 것.
7. 네이티브 빌드 의존성을 추가하면 루트 package.json `pnpm.onlyBuiltDependencies`에 등록 (이번 슬라이스 추가 의존성은 해당 없음).
8. Codex 샌드박스 제약: git 명령 금지 (커밋은 Claude 담당), pnpm install·docker·테스트 실행 불가 시 건너뛰고 목록으로 보고.

---

## 파일 구조 (추가/변경)

```
prisma/schema.prisma                                  # MediaAsset, OcrResult, Transcription, Job 추가
apps/server/src/
├── common/
│   ├── env.validation.ts                             # 스토리지·워커 env 추가
│   └── storage/storage.module.ts, storage.service.ts # S3 클라이언트 (presign/head/get/ensureBucket)
├── providers/
│   ├── ocr/ocr.provider.ts                           # 인터페이스 + DI 토큰
│   ├── ocr/mock-ocr.provider.ts
│   ├── ocr/ocr.module.ts                             # env로 구현 선택
│   ├── stt/stt.provider.ts, mock-stt.provider.ts, stt.module.ts
├── queues/
│   ├── queue.constants.ts                            # 큐 이름, jobId 규칙, redis 연결 헬퍼
│   └── media-processing.processor.ts                 # WorkerHost 프로세서
├── modules/
│   ├── jobs/job.model.ts, job-record.service.ts, jobs.resolver.ts, jobs.module.ts
│   └── media/media.models.ts, media.inputs.ts, media.service.ts, media.resolver.ts, media.module.ts
├── worker.module.ts                                  # Worker 프로세스 전용 모듈
├── worker.ts                                         # Nest 컨텍스트 + health :3001 로 재작성
└── generate-schema.ts                                # MediaResolver, JobsResolver 추가
apps/server/test/
├── create-test-app.ts                                # MinIO 컨테이너 추가, worker 컨텍스트 헬퍼
└── media-pipeline.e2e-spec.ts                        # 업로드→처리→READY 전체 흐름
apps/web/src/
├── hooks/useJobPolling.ts                            # 유일한 폴링 경로 (설계 원칙)
├── pages/MediaPage.tsx
└── App.tsx                                           # /media 라우트 + 최소 내비게이션
e2e/slice1.spec.ts, e2e/fixtures/sample.png
package.json                                          # e2e:stack, start:worker 스크립트
```

---

### Task 1: 의존성·환경변수 확장

**Files:**
- Modify: `apps/server/package.json`, `apps/server/src/common/env.validation.ts`, `.env.example`, `.env`

- [ ] **Step 1: 서버 의존성 추가**

Run: `pnpm --filter @babeloop/server add @nestjs/bullmq bullmq @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
Expected: 설치 성공 (샌드박스에서 불가 시 package.json dependencies에 직접 추가: `"@nestjs/bullmq": "^11.0.0", "bullmq": "^5.34.0", "@aws-sdk/client-s3": "^3.700.0", "@aws-sdk/s3-request-presigner": "^3.700.0"`)

- [ ] **Step 2: env 검증 확장**

`apps/server/src/common/env.validation.ts`의 `envSchema`에 추가:
```typescript
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().default('us-east-1'),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  WORKER_PORT: z.coerce.number().default(3001),
  OCR_PROVIDER: z.enum(['mock']).default('mock'),
  STT_PROVIDER: z.enum(['mock']).default('mock'),
```

- [ ] **Step 3: .env.example과 .env에 추가** (OBJECT_STORAGE_*는 이미 있음)

```
WORKER_PORT=3001
OCR_PROVIDER=mock
STT_PROVIDER=mock
```

- [ ] **Step 4: 컴파일 확인**

Run: `pnpm --filter @babeloop/server build`
Expected: 성공

- [ ] **Step 5: Commit** (Codex는 건너뜀)

```bash
git add apps/server .env.example
git commit -m "chore: BullMQ·S3 SDK 의존성 및 스토리지·워커 환경변수"
```

---

### Task 2: Prisma 스키마 확장 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 모델 추가**

`schema.prisma`에 추가 (User 모델에는 `mediaAssets MediaAsset[]` 관계 필드 추가):

```prisma
enum MediaAssetKind {
  IMAGE
  VIDEO
}

enum MediaAssetStatus {
  PENDING     // Presigned URL 발급됨, 업로드 미완료
  UPLOADED    // 업로드 확인됨, 처리 대기
  PROCESSING
  READY
  FAILED
}

model MediaAsset {
  id               String           @id @default(cuid())
  kind             MediaAssetKind
  status           MediaAssetStatus @default(PENDING)
  originalFilename String
  contentType      String
  sizeBytes        Int?
  contentHash      String? // sha256 — 중복 감지용
  duplicateOfId    String? // 같은 해시의 기존 자산
  storageKey       String           @unique
  uploadedById     String?
  uploadedBy       User?            @relation(fields: [uploadedById], references: [id])
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
  ocrResults       OcrResult[]
  transcriptions   Transcription[]

  @@index([status])
  @@index([contentHash])
  @@map("media_assets")
}

model OcrResult {
  id           String     @id @default(cuid())
  mediaAssetId String
  mediaAsset   MediaAsset @relation(fields: [mediaAssetId], references: [id], onDelete: Cascade)
  text         String
  provider     String
  model        String
  createdAt    DateTime   @default(now())

  @@map("ocr_results")
}

model Transcription {
  id           String     @id @default(cuid())
  mediaAssetId String
  mediaAsset   MediaAsset @relation(fields: [mediaAssetId], references: [id], onDelete: Cascade)
  text         String
  language     String?
  provider     String
  model        String
  createdAt    DateTime   @default(now())

  @@map("transcriptions")
}

enum JobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
}

model Job {
  id         String    @id // BullMQ jobId와 동일 = idempotency key
  queue      String
  type       String
  status     JobStatus @default(QUEUED)
  payload    Json
  result     Json?
  error      String?
  attempts   Int       @default(0)
  createdAt  DateTime  @default(now())
  startedAt  DateTime?
  finishedAt DateTime?

  @@index([status])
  @@map("jobs")
}
```

- [ ] **Step 2: 마이그레이션**

Run: `pnpm prisma migrate dev --name slice1-media-jobs`
Expected: 적용 성공, 클라이언트 재생성 (`apps/server/generated/prisma`)

- [ ] **Step 3: Commit**

```bash
git add prisma/
git commit -m "feat: MediaAsset·OcrResult·Transcription·Job 스키마"
```

---

### Task 3: StorageService + 테스트 인프라에 MinIO 추가

**Files:**
- Create: `apps/server/src/common/storage/storage.service.ts`, `storage.module.ts`
- Modify: `apps/server/test/create-test-app.ts`
- Create: `apps/server/test/storage.e2e-spec.ts`

- [ ] **Step 1: create-test-app에 MinIO 컨테이너 추가**

`create-test-app.ts`에서 컨테이너 시작 블록에 추가 (GenericContainer 사용 — @testcontainers/minio 별도 모듈 불필요):

```typescript
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

let minio: StartedTestContainer | undefined;
```

`if (!pg)` 블록 안에:
```typescript
    minio = await new GenericContainer('minio/minio:latest')
      .withEnvironment({ MINIO_ROOT_USER: 'testuser', MINIO_ROOT_PASSWORD: 'testsecret-0123' })
      .withCommand(['server', '/data'])
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000))
      .start();
    process.env.OBJECT_STORAGE_ENDPOINT = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
    process.env.OBJECT_STORAGE_REGION = 'us-east-1';
    process.env.OBJECT_STORAGE_BUCKET = 'babeloop-test';
    process.env.OBJECT_STORAGE_ACCESS_KEY = 'testuser';
    process.env.OBJECT_STORAGE_SECRET_KEY = 'testsecret-0123';
    process.env.WORKER_PORT = '0';
    process.env.OCR_PROVIDER = 'mock';
    process.env.STT_PROVIDER = 'mock';
```

`stopContainers()`에 `await minio?.stop(); minio = undefined;` 추가.

- [ ] **Step 2: 실패하는 테스트 작성**

`apps/server/test/storage.e2e-spec.ts`:
```typescript
import { createTestApp, stopContainers, TestApp } from './create-test-app';

describe('storage', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.teardown();
    await stopContainers();
  });

  it('Presigned URL로 업로드한 객체를 head/getBuffer로 읽을 수 있다', async () => {
    const { StorageService } = await import('../src/common/storage/storage.service');
    const storage = t.app.get(StorageService);

    const key = 'test/hello.txt';
    const url = await storage.presignPut(key, 'text/plain');
    const res = await fetch(url, {
      method: 'PUT',
      body: 'hello babeloop',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(res.ok).toBe(true);

    const head = await storage.head(key);
    expect(head?.sizeBytes).toBe(14);

    const buf = await storage.getBuffer(key);
    expect(buf.toString()).toBe('hello babeloop');
  });

  it('없는 객체의 head는 null을 반환한다', async () => {
    const { StorageService } = await import('../src/common/storage/storage.service');
    const storage = t.app.get(StorageService);
    expect(await storage.head('test/no-such-key')).toBeNull();
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter @babeloop/server test -- storage`
Expected: FAIL — StorageService 없음

- [ ] **Step 4: StorageService 구현**

`apps/server/src/common/storage/storage.service.ts`:
```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly bucket = process.env.OBJECT_STORAGE_BUCKET!;
  private readonly client = new S3Client({
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
    region: process.env.OBJECT_STORAGE_REGION,
    credentials: {
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY!,
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY!,
    },
    forcePathStyle: true, // MinIO 필수
  });

  async onModuleInit() {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (e: unknown) {
      const name = (e as { name?: string }).name;
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw e;
    }
  }

  presignPut(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: 900 },
    );
  }

  async head(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: res.ContentLength ?? 0 };
    } catch (e: unknown) {
      if ((e as { name?: string }).name === 'NotFound') return null;
      throw e;
    }
  }

  async getBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
}
```

`storage.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
```

주의: `S3Client`가 생성자 필드에서 `process.env`를 읽으므로 이 클래스는 env 세팅 이후에 로드되어야 한다 — create-test-app의 동적 import 패턴이 이미 이를 보장한다. `app.module.ts` imports에 `StorageModule` 추가.

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @babeloop/server test -- storage`
Expected: PASS 2건

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat: S3 호환 StorageService — presign/head/getBuffer, 버킷 자동 생성"
```

---

### Task 4: OCR·STT Provider 인터페이스 + Mock

**Files:**
- Create: `apps/server/src/providers/ocr/ocr.provider.ts`, `mock-ocr.provider.ts`, `ocr.module.ts`
- Create: `apps/server/src/providers/stt/stt.provider.ts`, `mock-stt.provider.ts`, `stt.module.ts`
- Create: `apps/server/src/providers/ocr/mock-ocr.provider.spec.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/server/src/providers/ocr/mock-ocr.provider.spec.ts`:
```typescript
import { MockOcrProvider } from './mock-ocr.provider';

describe('MockOcrProvider', () => {
  const provider = new MockOcrProvider();

  it('같은 입력에 같은 출력 (결정적)', async () => {
    const input = { buffer: Buffer.from('abc'), contentType: 'image/png', filename: 'a.png' };
    const first = await provider.extractText(input);
    const second = await provider.extractText(input);
    expect(first).toEqual(second);
    expect(first.text).toContain('[MOCK OCR]');
    expect(first.text).toContain('a.png');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @babeloop/server test -- mock-ocr`
Expected: FAIL

- [ ] **Step 3: 구현**

`apps/server/src/providers/ocr/ocr.provider.ts`:
```typescript
export interface OcrInput {
  buffer: Buffer;
  contentType: string;
  filename?: string;
}

export interface OcrOutput {
  text: string;
}

export interface OcrProvider {
  readonly name: string;
  readonly model: string;
  extractText(input: OcrInput): Promise<OcrOutput>;
}

export const OCR_PROVIDER = Symbol('OCR_PROVIDER');
```

`mock-ocr.provider.ts`:
```typescript
import { createHash } from 'crypto';
import { OcrInput, OcrOutput, OcrProvider } from './ocr.provider';

/** 결정적 Mock — 같은 입력이면 항상 같은 출력. E2E가 이 형식에 의존한다. */
export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock';
  readonly model = 'mock-ocr-1';

  async extractText(input: OcrInput): Promise<OcrOutput> {
    const hash = createHash('sha256').update(input.buffer).digest('hex').slice(0, 8);
    return { text: `[MOCK OCR] ${input.filename ?? 'file'} (${hash})` };
  }
}
```

`ocr.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { MockOcrProvider } from './mock-ocr.provider';
import { OCR_PROVIDER } from './ocr.provider';

@Global()
@Module({
  providers: [
    {
      provide: OCR_PROVIDER,
      useFactory: () => {
        const kind = process.env.OCR_PROVIDER ?? 'mock';
        if (kind === 'mock') return new MockOcrProvider();
        throw new Error(`미구현 OCR provider: ${kind}`);
      },
    },
  ],
  exports: [OCR_PROVIDER],
})
export class OcrModule {}
```

`apps/server/src/providers/stt/stt.provider.ts`:
```typescript
export interface SttInput {
  buffer: Buffer;
  contentType: string;
  filename?: string;
}

export interface SttOutput {
  text: string;
  language?: string;
}

export interface SttProvider {
  readonly name: string;
  readonly model: string;
  transcribe(input: SttInput): Promise<SttOutput>;
}

export const STT_PROVIDER = Symbol('STT_PROVIDER');
```

`apps/server/src/providers/stt/mock-stt.provider.ts`:
```typescript
import { createHash } from 'crypto';
import { SttInput, SttOutput, SttProvider } from './stt.provider';

/** 결정적 Mock — 같은 입력이면 항상 같은 출력. */
export class MockSttProvider implements SttProvider {
  readonly name = 'mock';
  readonly model = 'mock-stt-1';

  async transcribe(input: SttInput): Promise<SttOutput> {
    const hash = createHash('sha256').update(input.buffer).digest('hex').slice(0, 8);
    return { text: `[MOCK STT] ${input.filename ?? 'file'} (${hash})`, language: 'zh-TW' };
  }
}
```

`apps/server/src/providers/stt/stt.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { MockSttProvider } from './mock-stt.provider';
import { STT_PROVIDER } from './stt.provider';

@Global()
@Module({
  providers: [
    {
      provide: STT_PROVIDER,
      useFactory: () => {
        const kind = process.env.STT_PROVIDER ?? 'mock';
        if (kind === 'mock') return new MockSttProvider();
        throw new Error(`미구현 STT provider: ${kind}`);
      },
    },
  ],
  exports: [STT_PROVIDER],
})
export class SttModule {}
```

`app.module.ts` imports에 `OcrModule`, `SttModule` 추가.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @babeloop/server test -- mock-ocr`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat: OCR·STT Provider 인터페이스와 결정적 Mock 구현"
```

---

### Task 5: JobRecordService + Job GraphQL

**Files:**
- Create: `apps/server/src/modules/jobs/job.model.ts`, `job-record.service.ts`, `jobs.resolver.ts`, `jobs.module.ts`
- Modify: `apps/server/src/app.module.ts`, `apps/server/src/generate-schema.ts`

- [ ] **Step 1: 구현** (테스트는 Task 7 파이프라인 통합 테스트가 겸한다 — 이 서비스 단독 로직은 단순 CRUD)

`job.model.ts`:
```typescript
import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { JobStatus } from '../../../generated/prisma';

registerEnumType(JobStatus, { name: 'JobStatus' });

@ObjectType()
export class JobModel {
  @Field(() => ID) id: string;
  @Field() queue: string;
  @Field() type: string;
  @Field(() => JobStatus) status: JobStatus;
  @Field(() => String, { nullable: true }) error: string | null;
  @Field() createdAt: Date;
  @Field(() => Date, { nullable: true }) startedAt: Date | null;
  @Field(() => Date, { nullable: true }) finishedAt: Date | null;
}
```

`job-record.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class JobRecordService {
  constructor(private readonly prisma: PrismaService) {}

  /** 큐 등록 시점에 호출. 같은 id로 재등록되면 기존 행 유지 (idempotent). */
  enqueue(id: string, queue: string, type: string, payload: Prisma.InputJsonValue) {
    return this.prisma.job.upsert({
      where: { id },
      update: {},
      create: { id, queue, type, payload, status: 'QUEUED' },
    });
  }

  markRunning(id: string) {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
    });
  }

  markSucceeded(id: string, result?: Prisma.InputJsonValue) {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'SUCCEEDED', finishedAt: new Date(), result: result ?? Prisma.JsonNull },
    });
  }

  markFailed(id: string, error: string) {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'FAILED', finishedAt: new Date(), error },
    });
  }

  findById(id: string) {
    return this.prisma.job.findUnique({ where: { id } });
  }
}
```

`jobs.resolver.ts`:
```typescript
import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { JobModel } from './job.model';
import { JobRecordService } from './job-record.service';

@Resolver(() => JobModel)
@UseGuards(GqlAuthGuard)
export class JobsResolver {
  constructor(private readonly jobRecord: JobRecordService) {}

  @Query(() => JobModel, { nullable: true })
  job(@Args('id', { type: () => ID }) id: string) {
    return this.jobRecord.findById(id);
  }
}
```

`jobs.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobRecordService } from './job-record.service';
import { JobsResolver } from './jobs.resolver';

@Global()
@Module({ imports: [AuthModule], providers: [JobRecordService, JobsResolver], exports: [JobRecordService] })
export class JobsModule {}
```

`app.module.ts` imports에 `JobsModule` 추가. **`generate-schema.ts` resolver 목록에 `JobsResolver` 추가.**

- [ ] **Step 2: 컴파일 확인**

Run: `pnpm --filter @babeloop/server build`
Expected: 성공

- [ ] **Step 3: Commit**

```bash
git add apps/server
git commit -m "feat: Job 상태 미러링 서비스 및 job(id) GraphQL 폴링 쿼리"
```

---

### Task 6: BullMQ 배선 + MediaProcessingProcessor + WorkerModule

**Files:**
- Create: `apps/server/src/queues/queue.constants.ts`, `media-processing.processor.ts`, `apps/server/src/worker.module.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: 큐 상수·헬퍼 작성**

`queue.constants.ts`:
```typescript
export const MEDIA_PROCESSING_QUEUE = 'media-processing';

export const JOB_TYPES = {
  PROCESS_MEDIA: 'process-media',
} as const;

export function processMediaJobId(mediaAssetId: string): string {
  return `${JOB_TYPES.PROCESS_MEDIA}:${mediaAssetId}`;
}

/** BullMQ connection 옵션 — ioredis는 옵션 객체에서 url을 파싱하지 않으므로 직접 분해한다 */
export function redisConnectionFromUrl(url: string): { host: string; port: number } {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 6379) };
}
```

- [ ] **Step 2: API 쪽 BullMQ 등록**

`app.module.ts` imports에 추가:
```typescript
import { BullModule } from '@nestjs/bullmq';
import { redisConnectionFromUrl } from './queues/queue.constants';

BullModule.forRootAsync({
  useFactory: () => ({ connection: redisConnectionFromUrl(process.env.REDIS_URL!) }),
}),
```

- [ ] **Step 3: 프로세서 작성**

`media-processing.processor.ts`:
```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { AiExecutionLogService } from '../modules/ai-log/ai-execution-log.service';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { OCR_PROVIDER, OcrProvider } from '../providers/ocr/ocr.provider';
import { STT_PROVIDER, SttProvider } from '../providers/stt/stt.provider';
import { MEDIA_PROCESSING_QUEUE } from './queue.constants';

@Processor(MEDIA_PROCESSING_QUEUE)
export class MediaProcessingProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly aiLog: AiExecutionLogService,
    private readonly jobRecord: JobRecordService,
    @Inject(OCR_PROVIDER) private readonly ocr: OcrProvider,
    @Inject(STT_PROVIDER) private readonly stt: SttProvider,
  ) {
    super();
  }

  async process(job: BullJob<{ mediaAssetId: string }>): Promise<void> {
    const jobId = job.id!;
    await this.jobRecord.markRunning(jobId);
    const asset = await this.prisma.mediaAsset.findUniqueOrThrow({
      where: { id: job.data.mediaAssetId },
    });
    try {
      await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: 'PROCESSING' } });
      const buffer = await this.storage.getBuffer(asset.storageKey);
      const inputRef = `mediaAsset:${asset.id}`;

      if (asset.kind === 'IMAGE') {
        const out = await this.aiLog.record(
          { provider: this.ocr.name, model: this.ocr.model, inputRef },
          () => this.ocr.extractText({ buffer, contentType: asset.contentType, filename: asset.originalFilename }),
        );
        await this.prisma.ocrResult.create({
          data: { mediaAssetId: asset.id, text: out.text, provider: this.ocr.name, model: this.ocr.model },
        });
      } else {
        const out = await this.aiLog.record(
          { provider: this.stt.name, model: this.stt.model, inputRef },
          () => this.stt.transcribe({ buffer, contentType: asset.contentType, filename: asset.originalFilename }),
        );
        await this.prisma.transcription.create({
          data: { mediaAssetId: asset.id, text: out.text, language: out.language, provider: this.stt.name, model: this.stt.model },
        });
      }

      await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: 'READY' } });
      await this.jobRecord.markSucceeded(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: 'FAILED' } });
        await this.jobRecord.markFailed(jobId, message);
      }
      throw error; // BullMQ 재시도를 위해 다시 던진다
    }
  }
}
```

- [ ] **Step 4: WorkerModule 작성**

`worker.module.ts`:
```typescript
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { AiLogModule } from './modules/ai-log/ai-log.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { OcrModule } from './providers/ocr/ocr.module';
import { SttModule } from './providers/stt/stt.module';
import { MediaProcessingProcessor } from './queues/media-processing.processor';
import { MEDIA_PROCESSING_QUEUE, redisConnectionFromUrl } from './queues/queue.constants';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    BullModule.forRootAsync({
      useFactory: () => ({ connection: redisConnectionFromUrl(process.env.REDIS_URL!) }),
    }),
    BullModule.registerQueue({ name: MEDIA_PROCESSING_QUEUE }),
    PrismaModule,
    StorageModule,
    AiLogModule,
    JobsModule,
    OcrModule,
    SttModule,
  ],
  providers: [MediaProcessingProcessor],
})
export class WorkerModule {}
```

주의: JobsModule은 JobsResolver를 포함하지만 Worker 컨텍스트에는 GraphQLModule이 없으므로 Resolver 데코레이터는 실행되지 않고 무해하다.

- [ ] **Step 5: 컴파일 확인**

Run: `pnpm --filter @babeloop/server build`
Expected: 성공

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat: BullMQ media-processing 프로세서와 WorkerModule"
```

---

### Task 7: Media GraphQL + 파이프라인 통합 테스트

**Files:**
- Create: `apps/server/src/modules/media/media.models.ts`, `media.inputs.ts`, `media.service.ts`, `media.resolver.ts`, `media.module.ts`
- Create: `apps/server/test/media-pipeline.e2e-spec.ts`
- Modify: `apps/server/src/app.module.ts`, `generate-schema.ts`, `test/create-test-app.ts`

- [ ] **Step 1: create-test-app에 worker 컨텍스트 헬퍼 추가**

```typescript
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

export async function createWorkerContext(): Promise<INestApplicationContext> {
  const { WorkerModule } = await import('../src/worker.module');
  const ctx = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
  await ctx.init();
  return ctx; // teardown: await ctx.close() — BullMQ Worker 연결이 닫힌다 (핸들 누수 방지)
}
```

- [ ] **Step 2: 실패하는 통합 테스트 작성**

`apps/server/test/media-pipeline.e2e-spec.ts`:
```typescript
import { INestApplicationContext } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, createWorkerContext, stopContainers, TestApp } from './create-test-app';

const REQUEST_UPLOAD = `mutation Req($input: RequestMediaUploadInput!) {
  requestMediaUpload(input: $input) { uploadUrl mediaAsset { id status storageKey } }
}`;
const COMPLETE_UPLOAD = `mutation Done($input: CompleteMediaUploadInput!) {
  completeMediaUpload(input: $input) { mediaAsset { id status duplicateOfId } job { id status } }
}`;
const MEDIA_ASSET = `query Asset($id: ID!) {
  mediaAsset(id: $id) { id status ocrResults { text provider } }
}`;

async function login(t: TestApp) {
  const { PrismaService } = await import('../src/common/prisma/prisma.service');
  const prisma = t.app.get(PrismaService);
  await prisma.user.upsert({
    where: { email: 'media@test.local' },
    update: {},
    create: { email: 'media@test.local', passwordHash: await argon2.hash('pw-123456'), displayName: 'M', role: 'EDITOR' },
  });
  const agent = request.agent(t.app.getHttpServer());
  await agent.post('/graphql').send({
    query: `mutation { login(email: "media@test.local", password: "pw-123456") { id } }`,
  });
  return agent;
}

async function uploadImage(agent: ReturnType<typeof request.agent>, body: string, filename: string) {
  const req = await agent.post('/graphql').send({
    query: REQUEST_UPLOAD,
    variables: { input: { filename, contentType: 'image/png', kind: 'IMAGE' } },
  });
  expect(req.body.errors).toBeUndefined();
  const { uploadUrl, mediaAsset } = req.body.data.requestMediaUpload;
  expect(mediaAsset.status).toBe('PENDING');

  const put = await fetch(uploadUrl, { method: 'PUT', body, headers: { 'Content-Type': 'image/png' } });
  expect(put.ok).toBe(true);

  const done = await agent.post('/graphql').send({
    query: COMPLETE_UPLOAD,
    variables: { input: { mediaAssetId: mediaAsset.id } },
  });
  expect(done.body.errors).toBeUndefined();
  return done.body.data.completeMediaUpload as {
    mediaAsset: { id: string; status: string; duplicateOfId: string | null };
    job: { id: string; status: string };
  };
}

describe('media pipeline', () => {
  let t: TestApp;
  let worker: INestApplicationContext;

  beforeAll(async () => {
    t = await createTestApp();
    worker = await createWorkerContext();
  });

  afterAll(async () => {
    await worker.close();
    await t.teardown();
    await stopContainers();
  });

  it('업로드 → 완료 → 워커 처리 → READY + OCR 결과 + AI 로그', async () => {
    const agent = await login(t);
    const { mediaAsset, job } = await uploadImage(agent, 'fake-png-bytes-1', 'ad1.png');
    expect(mediaAsset.status).toBe('UPLOADED');
    expect(job.id).toBe(`process-media:${mediaAsset.id}`);

    // 워커 처리 대기 (최대 15초)
    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    const prisma = t.app.get(PrismaService);
    const deadline = Date.now() + 15_000;
    let status = '';
    while (Date.now() < deadline) {
      status = (await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaAsset.id } })).status;
      if (status === 'READY' || status === 'FAILED') break;
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(status).toBe('READY');

    const res = await agent.post('/graphql').send({ query: MEDIA_ASSET, variables: { id: mediaAsset.id } });
    expect(res.body.data.mediaAsset.ocrResults[0].text).toContain('[MOCK OCR]');
    expect(res.body.data.mediaAsset.ocrResults[0].provider).toBe('mock');

    const jobRow = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(jobRow.status).toBe('SUCCEEDED');

    const aiLogs = await prisma.aiExecutionLog.findMany({ where: { inputRef: `mediaAsset:${mediaAsset.id}` } });
    expect(aiLogs).toHaveLength(1);
    expect(aiLogs[0].status).toBe('SUCCESS');
  });

  it('같은 내용의 파일을 다시 올리면 duplicateOfId가 기존 자산을 가리킨다', async () => {
    const agent = await login(t);
    const first = await uploadImage(agent, 'same-bytes', 'dup1.png');
    const second = await uploadImage(agent, 'same-bytes', 'dup2.png');
    expect(second.mediaAsset.duplicateOfId).toBe(first.mediaAsset.id);
  });

  it('업로드 없이 완료를 호출하면 오류', async () => {
    const agent = await login(t);
    const req = await agent.post('/graphql').send({
      query: REQUEST_UPLOAD,
      variables: { input: { filename: 'never.png', contentType: 'image/png', kind: 'IMAGE' } },
    });
    const id = req.body.data.requestMediaUpload.mediaAsset.id;
    const done = await agent.post('/graphql').send({
      query: COMPLETE_UPLOAD,
      variables: { input: { mediaAssetId: id } },
    });
    expect(done.body.errors[0].message).toContain('업로드가 완료되지 않았습니다');
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter @babeloop/server test -- media-pipeline`
Expected: FAIL — requestMediaUpload 없음

- [ ] **Step 4: Media 모듈 구현**

`media.models.ts`:
```typescript
import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { MediaAssetKind, MediaAssetStatus } from '../../../generated/prisma';
import { JobModel } from '../jobs/job.model';

registerEnumType(MediaAssetKind, { name: 'MediaAssetKind' });
registerEnumType(MediaAssetStatus, { name: 'MediaAssetStatus' });

@ObjectType()
export class OcrResultModel {
  @Field(() => ID) id: string;
  @Field() text: string;
  @Field() provider: string;
  @Field() model: string;
}

@ObjectType()
export class TranscriptionModel {
  @Field(() => ID) id: string;
  @Field() text: string;
  @Field(() => String, { nullable: true }) language: string | null;
  @Field() provider: string;
  @Field() model: string;
}

@ObjectType()
export class MediaAssetModel {
  @Field(() => ID) id: string;
  @Field(() => MediaAssetKind) kind: MediaAssetKind;
  @Field(() => MediaAssetStatus) status: MediaAssetStatus;
  @Field() originalFilename: string;
  @Field() contentType: string;
  @Field(() => Int, { nullable: true }) sizeBytes: number | null;
  @Field(() => String, { nullable: true }) duplicateOfId: string | null;
  @Field() storageKey: string;
  @Field() createdAt: Date;
  @Field(() => [OcrResultModel]) ocrResults: OcrResultModel[];
  @Field(() => [TranscriptionModel]) transcriptions: TranscriptionModel[];
}

@ObjectType()
export class UploadRequestModel {
  @Field() uploadUrl: string;
  @Field(() => MediaAssetModel) mediaAsset: MediaAssetModel;
}

@ObjectType()
export class CompleteUploadModel {
  @Field(() => MediaAssetModel) mediaAsset: MediaAssetModel;
  @Field(() => JobModel) job: JobModel;
}
```

`media.inputs.ts`:
```typescript
import { Field, ID, InputType } from '@nestjs/graphql';
import { MediaAssetKind } from '../../../generated/prisma';

@InputType()
export class RequestMediaUploadInput {
  @Field() filename: string;
  @Field() contentType: string;
  @Field(() => MediaAssetKind) kind: MediaAssetKind;
}

@InputType()
export class CompleteMediaUploadInput {
  @Field(() => ID) mediaAssetId: string;
}
```

`media.service.ts`:
```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import { GraphQLError } from 'graphql';
import { User } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { JobRecordService } from '../jobs/job-record.service';
import { JOB_TYPES, MEDIA_PROCESSING_QUEUE, processMediaJobId } from '../../queues/queue.constants';
import { CompleteMediaUploadInput, RequestMediaUploadInput } from './media.inputs';

const MEDIA_INCLUDE = { ocrResults: true, transcriptions: true } as const;

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobRecord: JobRecordService,
    @InjectQueue(MEDIA_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  async requestUpload(user: User, input: RequestMediaUploadInput) {
    const expectedPrefix = input.kind === 'IMAGE' ? 'image/' : 'video/';
    if (!input.contentType.startsWith(expectedPrefix)) {
      throw new GraphQLError(`${input.kind} 업로드의 contentType은 ${expectedPrefix}* 이어야 합니다`, {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const safeName = input.filename.replace(/[^\w.\-가-힣]/g, '_');
    const storageKey = `media/${randomUUID()}/${safeName}`;
    const mediaAsset = await this.prisma.mediaAsset.create({
      data: {
        kind: input.kind,
        originalFilename: input.filename,
        contentType: input.contentType,
        storageKey,
        uploadedById: user.id,
      },
      include: MEDIA_INCLUDE,
    });
    const uploadUrl = await this.storage.presignPut(storageKey, input.contentType);
    return { uploadUrl, mediaAsset };
  }

  async completeUpload(input: CompleteMediaUploadInput) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: input.mediaAssetId } });
    if (!asset) throw new NotFoundException('미디어 자산을 찾을 수 없습니다');

    const head = await this.storage.head(asset.storageKey);
    if (!head) {
      throw new GraphQLError('업로드가 완료되지 않았습니다 — 파일을 먼저 업로드하세요', {
        extensions: { code: 'UPLOAD_NOT_FOUND' },
      });
    }

    const buffer = await this.storage.getBuffer(asset.storageKey);
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const duplicate = await this.prisma.mediaAsset.findFirst({
      where: { contentHash, id: { not: asset.id } },
      orderBy: { createdAt: 'asc' },
    });

    const mediaAsset = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: 'UPLOADED',
        sizeBytes: head.sizeBytes,
        contentHash,
        duplicateOfId: duplicate?.id ?? null,
      },
      include: MEDIA_INCLUDE,
    });

    const jobId = processMediaJobId(asset.id);
    await this.queue.add(
      JOB_TYPES.PROCESS_MEDIA,
      { mediaAssetId: asset.id },
      { jobId, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: false },
    );
    const job = await this.jobRecord.enqueue(jobId, MEDIA_PROCESSING_QUEUE, JOB_TYPES.PROCESS_MEDIA, {
      mediaAssetId: asset.id,
    });

    return { mediaAsset, job };
  }

  findAll() {
    return this.prisma.mediaAsset.findMany({ include: MEDIA_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async findById(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id }, include: MEDIA_INCLUDE });
    if (!asset) throw new NotFoundException('미디어 자산을 찾을 수 없습니다');
    return asset;
  }
}
```

`media.resolver.ts`:
```typescript
import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { User } from '../../../generated/prisma';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CompleteMediaUploadInput, RequestMediaUploadInput } from './media.inputs';
import { CompleteUploadModel, MediaAssetModel, UploadRequestModel } from './media.models';
import { MediaService } from './media.service';

@Resolver(() => MediaAssetModel)
@UseGuards(GqlAuthGuard, RolesGuard)
export class MediaResolver {
  constructor(private readonly mediaService: MediaService) {}

  @Query(() => [MediaAssetModel])
  mediaAssets() {
    return this.mediaService.findAll();
  }

  @Query(() => MediaAssetModel)
  mediaAsset(@Args('id', { type: () => ID }) id: string) {
    return this.mediaService.findById(id);
  }

  @Mutation(() => UploadRequestModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  requestMediaUpload(@CurrentUser() user: User, @Args('input') input: RequestMediaUploadInput) {
    return this.mediaService.requestUpload(user, input);
  }

  @Mutation(() => CompleteUploadModel)
  @Roles('ADMIN', 'EDITOR', 'REVIEWER')
  completeMediaUpload(@Args('input') input: CompleteMediaUploadInput) {
    return this.mediaService.completeUpload(input);
  }
}
```

`media.module.ts`:
```typescript
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MEDIA_PROCESSING_QUEUE } from '../../queues/queue.constants';
import { MediaResolver } from './media.resolver';
import { MediaService } from './media.service';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: MEDIA_PROCESSING_QUEUE })],
  providers: [MediaService, MediaResolver],
})
export class MediaModule {}
```

`app.module.ts` imports에 `MediaModule` 추가. **`generate-schema.ts`에 `MediaResolver` 추가.**

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @babeloop/server test -- media-pipeline`
Expected: PASS 3건

- [ ] **Step 6: 전체 회귀**

Run: `pnpm --filter @babeloop/server test`
Expected: 전부 PASS, **jest가 15초 내에 스스로 종료** (열린 핸들 없음)

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat: Presigned 업로드·완료 GraphQL과 미디어 처리 파이프라인 통합 테스트"
```

---

### Task 8: worker.ts 재구성 (Nest 컨텍스트 + health)

**Files:**
- Modify: `apps/server/src/worker.ts`

- [ ] **Step 1: 재작성**

```typescript
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'http';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const ctx = await NestFactory.createApplicationContext(WorkerModule);
  await ctx.init();

  const port = Number(process.env.WORKER_PORT ?? 3001);
  createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end('{"status":"ok","role":"worker"}');
  }).listen(port);
  console.log(`worker ready — media-processing 소비 중, health :${port}`);
}
bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: 기동 확인**

Run: `pnpm --filter @babeloop/server build && (node apps/server/dist/worker.js &) && sleep 3 && curl -s localhost:3001 && pkill -f 'dist/worker.js'`
Expected: `{"status":"ok","role":"worker"}`

- [ ] **Step 3: Commit**

```bash
git add apps/server
git commit -m "feat: worker 프로세스를 Nest 컨텍스트 + health 엔드포인트로 재구성"
```

---

### Task 9: React 미디어 페이지 + useJobPolling

**Files:**
- Create: `apps/web/src/hooks/useJobPolling.ts`, `apps/web/src/pages/MediaPage.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: useJobPolling 작성 — 유일한 작업 상태 폴링 경로**

`useJobPolling.ts`:
```typescript
import { useQuery } from '@apollo/client';
import { useEffect } from 'react';
import { graphql } from '../generated';

const JobDocument = graphql(`
  query Job($id: ID!) { job(id: $id) { id status error finishedAt } }
`);

/** 설계 원칙: 모든 비동기 작업 상태는 이 훅으로만 읽는다. Subscription 전환 시 이 훅 내부만 교체. */
export function useJobPolling(jobId: string | null) {
  const { data, stopPolling } = useQuery(JobDocument, {
    variables: { id: jobId ?? '' },
    skip: !jobId,
    pollInterval: 2000,
  });

  const status = data?.job?.status;
  useEffect(() => {
    if (status === 'SUCCEEDED' || status === 'FAILED') stopPolling();
  }, [status, stopPolling]);

  return data?.job ?? null;
}
```

- [ ] **Step 2: MediaPage 작성**

`MediaPage.tsx`:
```tsx
import { useMutation, useQuery } from '@apollo/client';
import { useEffect, useRef, useState } from 'react';
import { graphql } from '../generated';
import { useJobPolling } from '../hooks/useJobPolling';

const MediaAssetsDocument = graphql(`
  query MediaAssets {
    mediaAssets {
      id status kind originalFilename createdAt
      ocrResults { id text }
      transcriptions { id text }
    }
  }
`);

const RequestUploadDocument = graphql(`
  mutation RequestMediaUpload($input: RequestMediaUploadInput!) {
    requestMediaUpload(input: $input) { uploadUrl mediaAsset { id } }
  }
`);

const CompleteUploadDocument = graphql(`
  mutation CompleteMediaUpload($input: CompleteMediaUploadInput!) {
    completeMediaUpload(input: $input) { mediaAsset { id status } job { id status } }
  }
`);

export function MediaPage() {
  const { data, refetch } = useQuery(MediaAssetsDocument);
  const [requestUpload] = useMutation(RequestUploadDocument);
  const [completeUpload] = useMutation(CompleteUploadDocument);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const job = useJobPolling(jobId);
  useEffect(() => {
    if (job?.status === 'SUCCEEDED' || job?.status === 'FAILED') void refetch();
  }, [job?.status, refetch]);

  async function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const kind = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE';
      const req = await requestUpload({
        variables: { input: { filename: file.name, contentType: file.type, kind } },
      });
      const { uploadUrl, mediaAsset } = req.data!.requestMediaUpload;
      const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) throw new Error(`업로드 실패: HTTP ${put.status}`);
      const done = await completeUpload({ variables: { input: { mediaAssetId: mediaAsset.id } } });
      setJobId(done.data!.completeMediaUpload.job.id);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main>
      <h1>미디어</h1>
      <div>
        <input type="file" ref={fileRef} accept="image/*,video/*" />
        <button onClick={onUpload}>업로드</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {job && job.status !== 'SUCCEEDED' && job.status !== 'FAILED' && <p>분석 중… ({job.status})</p>}
      {job?.status === 'FAILED' && <p role="alert">분석 실패: {job.error}</p>}
      <ul>
        {data?.mediaAssets.map((a) => (
          <li key={a.id}>
            <strong>{a.originalFilename}</strong> — {a.status}
            {a.ocrResults.map((o) => (
              <p key={o.id}>{o.text}</p>
            ))}
            {a.transcriptions.map((tr) => (
              <p key={tr.id}>{tr.text}</p>
            ))}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: App.tsx에 라우트·내비게이션 추가**

로그인 후 화면에 공통 내비게이션을 붙인다:
```tsx
import { Link, Navigate, Route, Routes } from 'react-router';
import { MediaPage } from './pages/MediaPage';
```

로그인 상태 분기 내부를 다음 구조로 변경:
```tsx
  return (
    <>
      {me && (
        <nav>
          <Link to="/brands">브랜드</Link> | <Link to="/media">미디어</Link>
        </nav>
      )}
      <Routes>
        <Route path="/login" element={me ? <Navigate to="/brands" /> : <LoginPage onLogin={() => refetch()} />} />
        <Route path="/brands" element={me ? <BrandsPage /> : <Navigate to="/login" />} />
        <Route path="/media" element={me ? <MediaPage /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={me ? '/brands' : '/login'} />} />
      </Routes>
    </>
  );
```

- [ ] **Step 4: codegen + 타입 확인**

전제: `pnpm --filter @babeloop/server schema:emit`으로 최신 schema.gql 생성.

Run: `pnpm --filter @babeloop/server schema:emit && pnpm --filter @babeloop/web build`
Expected: 성공

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: 미디어 업로드 화면과 useJobPolling 훅"
```

---

### Task 10: E2E + 실행 스크립트

**Files:**
- Create: `e2e/slice1.spec.ts`, `e2e/fixtures/sample.png`
- Modify: `package.json`(루트), `e2e/playwright.config.ts`, `README.md`

- [ ] **Step 1: 픽스처 생성 (1x1 투명 PNG)**

Run:
```bash
mkdir -p e2e/fixtures && printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d > e2e/fixtures/sample.png && file e2e/fixtures/sample.png
```
Expected: `PNG image data, 1 x 1`

- [ ] **Step 2: 루트 스크립트 추가**

`package.json` scripts에:
```json
"start:worker": "node apps/server/dist/worker.js",
"e2e:stack": "pnpm build && sh -c 'node apps/server/dist/worker.js & exec node apps/server/dist/main.js'"
```

- [ ] **Step 3: playwright.config.ts의 webServer 교체**

```typescript
  webServer: {
    command: 'pnpm e2e:stack',
    cwd: '..',
    url: 'http://localhost:3000/health',
    reuseExistingServer: true,
    timeout: 180_000,
  },
```

- [ ] **Step 4: E2E 테스트 작성**

`e2e/slice1.spec.ts`:
```typescript
import { expect, test } from '@playwright/test';
import path from 'path';

test('이미지 업로드 → 분석 완료 → OCR 결과 표시', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('이메일').fill('admin@babeloop.local');
  await page.getByLabel('비밀번호').fill('changeme-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  await page.getByRole('link', { name: '미디어' }).click();
  await expect(page.getByRole('heading', { name: '미디어' })).toBeVisible();

  await page.setInputFiles('input[type=file]', path.join(__dirname, 'fixtures/sample.png'));
  await page.getByRole('button', { name: '업로드' }).click();

  await expect(page.getByText('[MOCK OCR]').first()).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 5: 실행 확인**

전제: docker compose 인프라 기동 + 시드 완료.

Run: `pnpm e2e`
Expected: slice0 + slice1 모두 passed

- [ ] **Step 6: README에 worker 실행 추가**

개발 섹션에 한 줄 추가: `pnpm --filter @babeloop/server build && pnpm start:worker  # BullMQ 워커 (업로드 분석에 필요)`

- [ ] **Step 7: Commit**

```bash
git add e2e package.json README.md
git commit -m "test: 슬라이스 1 완료 기준 E2E — 업로드·분석·OCR 표시"
```

---

## 슬라이스 1 완료 체크리스트

- [ ] `pnpm --filter @babeloop/server test` 전부 PASS + jest 15초 내 자체 종료
- [ ] `pnpm e2e` — slice0·slice1 모두 passed
- [ ] worker health `:3001` 응답
- [ ] 중복 파일 업로드 시 `duplicateOfId` 설정 (통합 테스트로 검증)
- [ ] 업로드 미완료 상태에서 complete 호출 시 명시적 오류
- [ ] `ai_execution_logs`에 mock OCR 실행 기록 존재

## 다음 슬라이스 예고

슬라이스 2: source_ads 등록(URL/파일/Sensor Tower CSV 임포트), 광고 분석(Mock Text AI), creative_embeddings + pgvector 유사 검색(`VectorSearchRepository`). fixtures/sensortower-creative-gallery-sample.csv를 파서 테스트에 사용.

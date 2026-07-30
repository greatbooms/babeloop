import { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { execSync } from 'child_process';
import * as path from 'path';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

let pg: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;
let minio: StartedTestContainer | undefined;

export interface TestApp {
  app: INestApplication;
  teardown: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  if (!pg) {
    pg = await new PostgreSqlContainer('pgvector/pgvector:pg17').start();
    redis = await new RedisContainer('redis:7-alpine').start();
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
    // 통합 테스트는 어떤 경우에도 실제 AI API를 호출하지 않는다.
    // ConfigModule이 루트 .env(운영 openai 설정)를 읽으므로, 여기서 먼저 세팅해 dotenv의 no-override로 이긴다.
    // (실측: 키 입력 후 첫 전체 테스트에서 실호출 발생 — 이 블록이 그 재발 방지다)
    process.env.OCR_PROVIDER = 'mock';
    process.env.STT_PROVIDER = 'mock';
    process.env.TEXT_AI_PROVIDER = 'mock';
    process.env.EMBEDDING_PROVIDER = 'mock';
    process.env.IMAGE_PROVIDER = 'mock';
    // 테스트는 로컬 MinIO 주소로 서명해야 한다 — 공개 주소(테일스케일 등)는 샌드박스에서 접근 불가.
    // delete 하면 ConfigModule(dotenv)이 .env에서 되채우므로 빈 값으로 고정한다.
    process.env.OBJECT_STORAGE_PUBLIC_ENDPOINT = '';
    delete process.env.TEXT_AI_API_KEY;
    delete process.env.EMBEDDING_API_KEY;
    delete process.env.STT_API_KEY;
    delete process.env.IMAGE_API_KEY;
    process.env.ALLOW_PRIVATE_EXTERNAL_URLS = 'true'; // 테스트 MinIO가 loopback이라 SSRF 관문 우회
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
  const closeSessionRedis = applySessionMiddleware(app);
  await app.init();

  return {
    app,
    teardown: async () => {
      await app.close();
      // 컨테이너 정지 전에 닫아야 ioredis 재연결 루프가 핸들을 잡고 있지 않는다
      await closeSessionRedis();
    },
  };
}

export async function createWorkerContext(): Promise<INestApplicationContext> {
  const { WorkerModule } = await import('../src/worker.module');
  const ctx = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
  await ctx.init();
  return ctx; // teardown: await ctx.close() — BullMQ Worker 연결이 닫힌다 (핸들 누수 방지)
}

export async function stopContainers(): Promise<void> {
  await pg?.stop();
  await redis?.stop();
  await minio?.stop();
  pg = undefined;
  redis = undefined;
  minio = undefined;
}

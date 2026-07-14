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

export async function stopContainers(): Promise<void> {
  await pg?.stop();
  await redis?.stop();
  pg = undefined;
  redis = undefined;
}

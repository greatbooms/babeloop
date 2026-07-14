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

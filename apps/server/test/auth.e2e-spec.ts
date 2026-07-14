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

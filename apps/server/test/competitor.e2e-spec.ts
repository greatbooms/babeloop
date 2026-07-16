import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, stopContainers, TestApp } from './create-test-app';

const CREATE = `mutation C($input: CreateCompetitorInput!) {
  createCompetitor(input: $input) { id name category }
}`;
const LIST = `query { competitors { id name category } }`;

async function loginAs(t: TestApp, email: string, role: 'EDITOR' | 'VIEWER') {
  const { PrismaService } = await import('../src/common/prisma/prisma.service');
  const prisma = t.app.get(PrismaService);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: await argon2.hash('pw-123456'), displayName: role, role },
  });
  const agent = request.agent(t.app.getHttpServer());
  await agent.post('/graphql').send({ query: `mutation { login(email: "${email}", password: "pw-123456") { id } }` });
  return agent;
}

describe('competitor', () => {
  let t: TestApp;

  beforeAll(async () => { t = await createTestApp(); });
  afterAll(async () => { await t.teardown(); await stopContainers(); });

  it('EDITOR는 경쟁사를 등록하고 목록에서 볼 수 있다', async () => {
    const agent = await loginAs(t, 'comp-editor@test.local', 'EDITOR');
    const res = await agent.post('/graphql').send({
      query: CREATE, variables: { input: { name: 'WHIF', category: 'DIRECT_COMPETITOR' } },
    });
    expect(res.body.errors).toBeUndefined();
    const list = await agent.post('/graphql').send({ query: LIST });
    expect(list.body.data.competitors.some((c: { name: string }) => c.name === 'WHIF')).toBe(true);
  });

  it('같은 이름 재등록은 오류', async () => {
    const agent = await loginAs(t, 'comp-editor@test.local', 'EDITOR');
    const res = await agent.post('/graphql').send({
      query: CREATE, variables: { input: { name: 'WHIF', category: 'DIRECT_COMPETITOR' } },
    });
    expect(res.body.errors).toBeDefined();
  });

  it('VIEWER는 등록할 수 없다', async () => {
    const agent = await loginAs(t, 'comp-viewer@test.local', 'VIEWER');
    const res = await agent.post('/graphql').send({
      query: CREATE, variables: { input: { name: 'Talkie', category: 'CREATIVE_REFERENCE' } },
    });
    expect(res.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });
});

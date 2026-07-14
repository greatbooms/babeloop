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

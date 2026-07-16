import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, stopContainers, TestApp } from './create-test-app';

const CREATE_AD = `mutation C($input: CreateSourceAdInput!) {
  createSourceAd(input: $input) { sourceAd { id status adText externalId } job { id } }
}`;
const ADS = `query { sourceAds { id status adText title } }`;

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

describe('source ad', () => {
  let t: TestApp;

  beforeAll(async () => { t = await createTestApp(); });
  afterAll(async () => { await t.teardown(); await stopContainers(); });

  it('EDITOR가 광고를 등록하면 URL을 정규화하고 분석 잡을 만든다', async () => {
    const agent = await loginAs(t, 'ad-editor@test.local', 'EDITOR');
    const res = await agent.post('/graphql').send({
      query: CREATE_AD,
      variables: {
        input: {
          adText: '이번엔 네가 주인공이야',
          title: '훅 테스트',
          sourceUrl: 'https://example.com/Ad?utm=x&b=2',
        },
      },
    });
    expect(res.body.errors).toBeUndefined();
    const { sourceAd, job } = res.body.data.createSourceAd;
    expect(sourceAd.status).toBe('REGISTERED');
    expect(job.id).toBe(`analyze-creative--${sourceAd.id}`);
    expect(sourceAd.externalId).toBe('https://example.com/Ad?b=2&utm=x');
    const list = await agent.post('/graphql').send({ query: ADS });
    expect(list.body.data.sourceAds.some((ad: { id: string }) => ad.id === sourceAd.id)).toBe(true);
  });

  it('동일 URL을 다시 등록하면 DUPLICATE_SOURCE_AD 오류', async () => {
    const agent = await loginAs(t, 'ad-editor@test.local', 'EDITOR');
    const res = await agent.post('/graphql').send({
      query: CREATE_AD,
      variables: { input: { adText: '중복', sourceUrl: 'https://example.com/Ad?b=2&utm=x' } },
    });
    expect(res.body.errors[0].extensions.code).toBe('DUPLICATE_SOURCE_AD');
  });

  it('adText와 sourceUrl이 모두 없으면 BAD_USER_INPUT', async () => {
    const agent = await loginAs(t, 'ad-editor@test.local', 'EDITOR');
    const res = await agent.post('/graphql').send({ query: CREATE_AD, variables: { input: { title: '빈 광고' } } });
    expect(res.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
});

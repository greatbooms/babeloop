import { INestApplicationContext } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, createWorkerContext, stopContainers, TestApp } from './create-test-app';

const CREATE_AD = `mutation C($input: CreateSourceAdInput!) {
  createSourceAd(input: $input) { sourceAd { id } job { id } }
}`;
const SIMILAR = `query S($input: SimilarSourceAdsInput!) {
  similarSourceAds(input: $input) { similarity sourceAd { id adText } }
}`;
const REEMBED = `mutation { reembedSourceAds { enqueued } }`;

describe('analysis pipeline', () => {
  let t: TestApp;
  let worker: INestApplicationContext;
  let agent: ReturnType<typeof request.agent>;
  const ids: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    worker = await createWorkerContext();
    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    const prisma = t.app.get(PrismaService);
    await prisma.user.upsert({
      where: { email: 'analysis@test.local' },
      update: {},
      create: {
        email: 'analysis@test.local',
        passwordHash: await argon2.hash('pw-123456'),
        displayName: 'A',
        role: 'ADMIN',
      },
    });
    agent = request.agent(t.app.getHttpServer());
    await agent.post('/graphql').send({
      query: `mutation { login(email: "analysis@test.local", password: "pw-123456") { id } }`,
    });
  });

  afterAll(async () => {
    await worker.close();
    await t.teardown();
    await stopContainers();
  });

  it('광고 세 건을 분석하고 임베딩·AI 로그를 만든다', async () => {
    for (const adText of [
      '完全相同的廣告文案',
      '完全相同的廣告文案',
      '全然不同的內容因此向量不同',
    ]) {
      const res = await agent.post('/graphql').send({
        query: CREATE_AD,
        variables: { input: { adText } },
      });
      expect(res.body.errors).toBeUndefined();
      ids.push(res.body.data.createSourceAd.sourceAd.id);
    }

    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    const prisma = t.app.get(PrismaService);
    const deadline = Date.now() + 15_000;
    let statuses: string[] = [];
    while (Date.now() < deadline) {
      const ads = await prisma.sourceAd.findMany({ where: { id: { in: ids } } });
      statuses = ads.map((ad) => ad.status);
      if (statuses.length === 3 && statuses.every((status) => status === 'ANALYZED' || status === 'FAILED')) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(statuses).toEqual(['ANALYZED', 'ANALYZED', 'ANALYZED']);

    const analyses = await prisma.creativeAnalysis.findMany({ where: { sourceAdId: { in: ids } } });
    expect(analyses).toHaveLength(3);
    expect(analyses.every((analysis) => analysis.provider === 'mock')).toBe(true);
    expect(analyses.every((analysis) => analysis.promptVersion === 'analyze-creative@v3')).toBe(true);

    const logs = await prisma.aiExecutionLog.findMany({
      where: { inputRef: { in: ids.map((id) => `sourceAd:${id}`) } },
    });
    expect(logs.some((log) => log.model === 'mock-text-1')).toBe(true);
    expect(logs.some((log) => log.model === 'mock-embedding-1')).toBe(true);
  });

  it('동일 문안 광고가 첫 유사 결과이고 자신은 제외된다', async () => {
    const res = await agent.post('/graphql').send({
      query: SIMILAR,
      variables: { input: { sourceAdId: ids[0], limit: 5 } },
    });
    expect(res.body.errors).toBeUndefined();
    const results = res.body.data.similarSourceAds as Array<{
      similarity: number;
      sourceAd: { id: string; adText: string };
    }>;
    expect(results[0].sourceAd.id).toBe(ids[1]);
    expect(results[0].similarity).toBeCloseTo(1, 3);
    expect(results.map((result) => result.sourceAd.id)).not.toContain(ids[0]);
    const different = results.find((result) => result.sourceAd.id === ids[2]);
    if (different) expect(different.similarity).toBeLessThan(results[0].similarity);
  });

  it('ANALYZED 광고를 inputText 없이 다시 임베딩한다', async () => {
    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    const prisma = t.app.get(PrismaService);
    const zeroVector = `[${Array.from({ length: 1536 }, () => 0).join(',')}]`;
    await prisma.$executeRaw`
      UPDATE creative_embeddings SET embedding = ${zeroVector}::vector
      WHERE "sourceAdId" IN (${ids[0]}, ${ids[1]}, ${ids[2]}) AND model = 'mock-embedding-1'`;

    const res = await agent.post('/graphql').send({ query: REEMBED });
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.reembedSourceAds.enqueued).toBeGreaterThanOrEqual(ids.length);

    const deadline = Date.now() + 15_000;
    let updated = 0;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<Array<{ embedding: string }>>`
        SELECT embedding::text AS embedding FROM creative_embeddings
        WHERE "sourceAdId" IN (${ids[0]}, ${ids[1]}, ${ids[2]}) AND model = 'mock-embedding-1'`;
      updated = rows.filter((row) => row.embedding !== zeroVector).length;
      if (updated === ids.length) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(updated).toBe(ids.length);
  });
});

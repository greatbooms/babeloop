import { createTestApp, stopContainers, TestApp } from './create-test-app';

describe('VectorSearchRepository', () => {
  let t: TestApp;
  let repo: import('../src/modules/creative-analysis/vector-search.repository').VectorSearchRepository;
  const adIds: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    const { VectorSearchRepository } = await import('../src/modules/creative-analysis/vector-search.repository');
    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    repo = t.app.get(VectorSearchRepository);
    const prisma = t.app.get(PrismaService);
    for (let i = 0; i < 3; i++) {
      const ad = await prisma.sourceAd.create({
        data: { origin: 'MANUAL_URL', provider: 'manual', adText: `ad-${i}` },
      });
      adIds.push(ad.id);
    }
  });

  afterAll(async () => {
    await t.teardown();
    await stopContainers();
  });

  const unit = (i: number) => {
    const v = new Array(1536).fill(0);
    v[i] = 1;
    return v;
  };

  it('업서트 후 같은 벡터 검색 시 similarity 1에 수렴한다', async () => {
    await repo.upsertEmbedding({ sourceAdId: adIds[0], model: 'mock-embedding-1', dimension: 1536, vector: unit(0) });
    await repo.upsertEmbedding({ sourceAdId: adIds[1], model: 'mock-embedding-1', dimension: 1536, vector: unit(0) });
    await repo.upsertEmbedding({ sourceAdId: adIds[2], model: 'mock-embedding-1', dimension: 1536, vector: unit(5) });

    const results = await repo.searchSimilar({
      vector: unit(0), model: 'mock-embedding-1', limit: 10, excludeSourceAdId: adIds[0],
    });
    expect(results[0].sourceAdId).toBe(adIds[1]);
    expect(results[0].similarity).toBeCloseTo(1, 5);
    expect(results.map((r) => r.sourceAdId)).not.toContain(adIds[0]);
  });

  it('모델이 다르면 검색되지 않는다 (혼합 검색 금지)', async () => {
    const results = await repo.searchSimilar({ vector: unit(0), model: 'other-model', limit: 10 });
    expect(results).toHaveLength(0);
  });

  it('차원 불일치는 저장 시점에 거부된다', async () => {
    await expect(
      repo.upsertEmbedding({ sourceAdId: adIds[0], model: 'mock-embedding-1', dimension: 1536, vector: [1, 2, 3] }),
    ).rejects.toThrow('임베딩 차원 불일치');
  });

  it('저장된 벡터를 다시 읽을 수 있다', async () => {
    const v = await repo.getEmbeddingVector(adIds[2], 'mock-embedding-1');
    expect(v).toHaveLength(1536);
    expect(v![5]).toBeCloseTo(1, 5);
  });
});

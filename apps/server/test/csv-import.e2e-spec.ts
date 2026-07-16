import { INestApplicationContext } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, createWorkerContext, stopContainers, TestApp } from './create-test-app';

const IMPORT = `mutation I($input: ImportSensorTowerCsvInput!) {
  importSensorTowerCsv(input: $input) { importedCount duplicateCount errors }
}`;

function makeCsv(url: string): string {
  return (
    '"Advertiser App ID"\t"Advertiser App Name"\t"Creative URL"\t"Networks"\t"Duration"\t"First Seen"\t"Last Seen"\t"Impression Share"\t"Countries"\t"Type"\t"Format"\t"Placements"\t"Dimensions"\t"Video Duration"\n' +
    `"app1"\t"WHIF"\t"${url}"\t"TikTok"\t30\t"2026-06-01"\t"2026-07-01"\t0.42\t"TW"\t"image"\t"other"\t"feed"\t"1x1"\t\n`
  );
}

describe('csv import', () => {
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

  it('임포트 → SourceAd 생성 → 미디어 다운로드 → MediaAsset 연결', async () => {
    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    const { StorageService } = await import('../src/common/storage/storage.service');
    const prisma = t.app.get(PrismaService);
    const storage = t.app.get(StorageService);

    await storage.putBuffer('external/creative1.png', Buffer.from('fake-image-bytes'), 'image/png');
    const externalUrl = await storage.presignGet('external/creative1.png');

    await prisma.user.upsert({
      where: { email: 'csv@test.local' },
      update: {},
      create: { email: 'csv@test.local', passwordHash: await argon2.hash('pw-123456'), displayName: 'C', role: 'EDITOR' },
    });
    const agent = request.agent(t.app.getHttpServer());
    await agent.post('/graphql').send({ query: `mutation { login(email: "csv@test.local", password: "pw-123456") { id } }` });

    const fileBase64 = Buffer.from(makeCsv(externalUrl), 'utf8').toString('base64');
    const res = await agent.post('/graphql').send({ query: IMPORT, variables: { input: { fileBase64 } } });
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.importSensorTowerCsv.importedCount).toBe(1);

    const deadline = Date.now() + 15_000;
    let ad = await prisma.sourceAd.findFirstOrThrow({ where: { provider: 'sensortower-csv' } });
    while (Date.now() < deadline && !ad.mediaAssetId) {
      await new Promise((r) => setTimeout(r, 300));
      ad = await prisma.sourceAd.findUniqueOrThrow({ where: { id: ad.id } });
    }
    expect(ad.mediaAssetId).not.toBeNull();
    expect(ad.isEstimated).toBe(true);
    expect(ad.impressionShare).toBeCloseTo(0.42);

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: ad.mediaAssetId! } });
    expect(asset.kind).toBe('IMAGE');

    const again = await agent.post('/graphql').send({ query: IMPORT, variables: { input: { fileBase64 } } });
    expect(again.body.data.importSensorTowerCsv.importedCount).toBe(0);
    expect(again.body.data.importSensorTowerCsv.duplicateCount).toBe(1);
  });
});

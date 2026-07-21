import { INestApplicationContext } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createTestApp, createWorkerContext, stopContainers, TestApp } from './create-test-app';

const REQUEST_UPLOAD = `mutation Req($input: RequestMediaUploadInput!) {
  requestMediaUpload(input: $input) { uploadUrl mediaAsset { id status storageKey } }
}`;
const COMPLETE_UPLOAD = `mutation Done($input: CompleteMediaUploadInput!) {
  completeMediaUpload(input: $input) { mediaAsset { id status duplicateOfId } job { id status } }
}`;
const MEDIA_ASSET = `query Asset($id: ID!) {
  mediaAsset(id: $id) { id status ocrResults { text provider } }
}`;
const PROCESS_MEDIA = `mutation Process($mediaAssetId: ID!) {
  processMediaAsset(mediaAssetId: $mediaAssetId) { id status }
}`;

async function login(t: TestApp) {
  const { PrismaService } = await import('../src/common/prisma/prisma.service');
  const prisma = t.app.get(PrismaService);
  await prisma.user.upsert({
    where: { email: 'media@test.local' },
    update: {},
    create: { email: 'media@test.local', passwordHash: await argon2.hash('pw-123456'), displayName: 'M', role: 'EDITOR' },
  });
  const agent = request.agent(t.app.getHttpServer());
  await agent.post('/graphql').send({
    query: `mutation { login(email: "media@test.local", password: "pw-123456") { id } }`,
  });
  return agent;
}

async function uploadImage(agent: ReturnType<typeof request.agent>, body: string, filename: string) {
  const req = await agent.post('/graphql').send({
    query: REQUEST_UPLOAD,
    variables: { input: { filename, contentType: 'image/png', kind: 'IMAGE' } },
  });
  expect(req.body.errors).toBeUndefined();
  const { uploadUrl, mediaAsset } = req.body.data.requestMediaUpload;
  expect(mediaAsset.status).toBe('PENDING');

  const put = await fetch(uploadUrl, { method: 'PUT', body, headers: { 'Content-Type': 'image/png' } });
  expect(put.ok).toBe(true);

  const done = await agent.post('/graphql').send({
    query: COMPLETE_UPLOAD,
    variables: { input: { mediaAssetId: mediaAsset.id } },
  });
  expect(done.body.errors).toBeUndefined();
  return done.body.data.completeMediaUpload as {
    mediaAsset: { id: string; status: string; duplicateOfId: string | null };
    job: { id: string; status: string };
  };
}

describe('media pipeline', () => {
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

  it('업로드 → 완료 → 워커 처리 → READY + OCR 결과 + AI 로그', async () => {
    const agent = await login(t);
    const { mediaAsset, job } = await uploadImage(agent, 'fake-png-bytes-1', 'ad1.png');
    expect(mediaAsset.status).toBe('UPLOADED');
    expect(job.id).toBe(`process-media--${mediaAsset.id}`);

    // 워커 처리 대기 (최대 15초)
    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    const prisma = t.app.get(PrismaService);
    const deadline = Date.now() + 15_000;
    let status = '';
    while (Date.now() < deadline) {
      status = (await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaAsset.id } })).status;
      if (status === 'READY' || status === 'FAILED') break;
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(status).toBe('READY');

    const res = await agent.post('/graphql').send({ query: MEDIA_ASSET, variables: { id: mediaAsset.id } });
    expect(res.body.data.mediaAsset.ocrResults[0].text).toContain('[MOCK OCR]');
    expect(res.body.data.mediaAsset.ocrResults[0].provider).toBe('mock');

    const jobRow = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(jobRow.status).toBe('SUCCEEDED');

    const aiLogs = await prisma.aiExecutionLog.findMany({ where: { inputRef: `mediaAsset:${mediaAsset.id}` } });
    expect(aiLogs).toHaveLength(1);
    expect(aiLogs[0].status).toBe('SUCCESS');
  });

  it('같은 내용의 파일을 다시 올리면 duplicateOfId가 기존 자산을 가리킨다', async () => {
    const agent = await login(t);
    const first = await uploadImage(agent, 'same-bytes', 'dup1.png');
    const second = await uploadImage(agent, 'same-bytes', 'dup2.png');
    expect(second.mediaAsset.duplicateOfId).toBe(first.mediaAsset.id);
  });

  it('READY 자산을 수동으로 재처리하면 기존 OCR 결과가 새 결과로 교체된다', async () => {
    const agent = await login(t);
    const { mediaAsset } = await uploadImage(agent, 'reprocess-bytes', 'reprocess.png');
    const { PrismaService } = await import('../src/common/prisma/prisma.service');
    const prisma = t.app.get(PrismaService);
    const firstDeadline = Date.now() + 15_000;
    while (Date.now() < firstDeadline) {
      if ((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaAsset.id } })).status === 'READY') break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const firstResult = await prisma.ocrResult.findFirstOrThrow({ where: { mediaAssetId: mediaAsset.id } });

    const process = await agent.post('/graphql').send({ query: PROCESS_MEDIA, variables: { mediaAssetId: mediaAsset.id } });
    expect(process.body.errors).toBeUndefined();
    const secondDeadline = Date.now() + 15_000;
    while (Date.now() < secondDeadline) {
      const rows = await prisma.ocrResult.findMany({ where: { mediaAssetId: mediaAsset.id } });
      if (rows.length === 1 && rows[0].id !== firstResult.id) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const rows = await prisma.ocrResult.findMany({ where: { mediaAssetId: mediaAsset.id } });
    expect(rows).toHaveLength(1); // 추가가 아니라 교체
    expect(rows[0].id).not.toBe(firstResult.id);
  });

  it('업로드 없이 완료를 호출하면 오류', async () => {
    const agent = await login(t);
    const req = await agent.post('/graphql').send({
      query: REQUEST_UPLOAD,
      variables: { input: { filename: 'never.png', contentType: 'image/png', kind: 'IMAGE' } },
    });
    const id = req.body.data.requestMediaUpload.mediaAsset.id;
    const done = await agent.post('/graphql').send({
      query: COMPLETE_UPLOAD,
      variables: { input: { mediaAssetId: id } },
    });
    expect(done.body.errors[0].message).toContain('업로드가 완료되지 않았습니다');
  });
});

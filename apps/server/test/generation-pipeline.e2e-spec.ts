import { INestApplicationContext } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { createTestApp, createWorkerContext, stopContainers, TestApp } from './create-test-app';

const CREATE_AD = `mutation CreateAd($input: CreateSourceAdInput!) {
  createSourceAd(input: $input) { sourceAd { id } job { id } }
}`;

const GENERATE_BRIEF = `mutation GenerateBrief($input: GenerateCreativeBriefInput!) {
  generateCreativeBrief(input: $input) { job { id status } }
}`;

const GENERATE_VARIANTS = `mutation GenerateVariants($input: GenerateCreativeVariantsInput!) {
  generateCreativeVariants(input: $input) { job { id status } }
}`;

const BRIEF = `query Brief($id: ID!) {
  creativeBrief(id: $id) {
    id title sourceAdIds rationale hookType audienceHypothesis desire
    creatives {
      id type status variantIndex koreanText scenesJson
      localizations { kind locale text }
    }
  }
}`;

describe('generation pipeline', () => {
  let t: TestApp;
  let worker: INestApplicationContext;
  let agent: ReturnType<typeof request.agent>;
  let prisma: PrismaService;

  beforeAll(async () => {
    t = await createTestApp();
    worker = await createWorkerContext();
    prisma = t.app.get(PrismaService);
    await prisma.user.upsert({
      where: { email: 'generation@test.local' },
      update: {},
      create: {
        email: 'generation@test.local',
        passwordHash: await argon2.hash('pw-123456'),
        displayName: 'Generation Editor',
        role: 'EDITOR',
      },
    });
    agent = request.agent(t.app.getHttpServer());
    await agent.post('/graphql').send({
      query: `mutation { login(email: "generation@test.local", password: "pw-123456") { id } }`,
    });
  });

  afterAll(async () => {
    if (worker) await worker.close();
    if (t) await t.teardown();
    await stopContainers();
  });

  async function waitForJob(jobId: string, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const row = await prisma.job.findUnique({ where: { id: jobId } });
      if (row?.status === 'SUCCEEDED') return row;
      if (row?.status === 'FAILED') throw new Error(`잡 실패: ${row.error}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`잡 완료 대기 시간 초과: ${jobId}`);
  }

  it('브리프 RAG → 문구·영상 변형 → zh-TW 초안과 감사 로그를 만든다', async () => {
    const adResponse = await agent.post('/graphql').send({
      query: CREATE_AD,
      variables: { input: { adText: '이야기의 주인공이 되는 경험' } },
    });
    expect(adResponse.body.errors).toBeUndefined();
    const sourceAdId = adResponse.body.data.createSourceAd.sourceAd.id as string;
    await waitForJob(adResponse.body.data.createSourceAd.job.id);
    // ANALYZED는 분석 잡이 아니라 체인 뒤의 임베딩 잡이 설정한다 — 상태를 직접 폴링해야 레이스가 없다
    const statusDeadline = Date.now() + 15_000;
    let adStatus = '';
    while (Date.now() < statusDeadline) {
      adStatus = (await prisma.sourceAd.findUniqueOrThrow({ where: { id: sourceAdId } })).status;
      if (adStatus === 'ANALYZED' || adStatus === 'FAILED') break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(adStatus).toBe('ANALYZED');

    const briefResponse = await agent.post('/graphql').send({
      query: GENERATE_BRIEF,
      variables: { input: { focusText: '주인공이 되는 로맨스' } },
    });
    expect(briefResponse.body.errors).toBeUndefined();
    const briefJob = await waitForJob(briefResponse.body.data.generateCreativeBrief.job.id);
    const briefId = (briefJob.result as { briefId: string }).briefId;

    const initialBriefResponse = await agent.post('/graphql').send({
      query: BRIEF,
      variables: { id: briefId },
    });
    expect(initialBriefResponse.body.errors).toBeUndefined();
    const initialBrief = initialBriefResponse.body.data.creativeBrief;
    expect(initialBrief.title).toContain('[MOCK 브리프]');
    expect(initialBrief.sourceAdIds).toContain(sourceAdId);
    expect(initialBrief.rationale).toBeTruthy();
    expect(initialBrief.hookType).toBeTruthy();
    expect(initialBrief.audienceHypothesis).toBeTruthy();

    const copyResponse = await agent.post('/graphql').send({
      query: GENERATE_VARIANTS,
      variables: { input: { briefId, type: 'COPY', count: 3 } },
    });
    expect(copyResponse.body.errors).toBeUndefined();
    await waitForJob(copyResponse.body.data.generateCreativeVariants.job.id);

    const localizationDeadline = Date.now() + 15_000;
    let copies: Array<{
      variantIndex: number;
      koreanText: string;
      localizations: Array<{ kind: string; text: string }>;
    }> = [];
    while (Date.now() < localizationDeadline) {
      const brief = await prisma.creativeBrief.findUniqueOrThrow({
        where: { id: briefId },
        include: { creatives: { include: { localizations: true } } },
      });
      copies = brief.creatives.filter((creative) => creative.type === 'COPY');
      if (
        copies.length === 3 &&
        copies.every((creative) =>
          creative.localizations.some(
            (localization) =>
              localization.kind === 'AI_DRAFT' && localization.text.includes('[MOCK zh-TW]'),
          ),
        )
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(copies.map((creative) => creative.variantIndex)).toEqual([1, 2, 3]);
    expect(copies.map((creative) => creative.koreanText)).toEqual([
      expect.stringContaining('[MOCK 문구 1]'),
      expect.stringContaining('[MOCK 문구 2]'),
      expect.stringContaining('[MOCK 문구 3]'),
    ]);
    expect(
      copies.every((creative) => creative.localizations.filter((item) => item.kind === 'AI_DRAFT').length === 1),
    ).toBe(true);

    const scriptResponse = await agent.post('/graphql').send({
      query: GENERATE_VARIANTS,
      variables: { input: { briefId, type: 'VIDEO_SCRIPT', count: 2 } },
    });
    expect(scriptResponse.body.errors).toBeUndefined();
    await waitForJob(scriptResponse.body.data.generateCreativeVariants.job.id);
    const finalBriefResponse = await agent.post('/graphql').send({ query: BRIEF, variables: { id: briefId } });
    expect(finalBriefResponse.body.errors).toBeUndefined();
    const scripts = finalBriefResponse.body.data.creativeBrief.creatives.filter(
      (creative: { type: string }) => creative.type === 'VIDEO_SCRIPT',
    );
    expect(scripts).toHaveLength(2);
    expect(JSON.parse(scripts[0].scenesJson)).toEqual(
      expect.arrayContaining([expect.objectContaining({ seconds: 0, visual: expect.any(String) })]),
    );

    const logs = await prisma.aiExecutionLog.findMany({
      where: {
        promptVersion: {
          in: ['generate-brief@v1', 'generate-copy-variants@v1', 'localize-zh-tw@v1'],
        },
      },
    });
    expect(new Set(logs.map((log) => log.promptVersion))).toEqual(
      new Set(['generate-brief@v1', 'generate-copy-variants@v1', 'localize-zh-tw@v1']),
    );
  });

  it('focusText와 sourceAdIds가 모두 없으면 BAD_USER_INPUT을 반환한다', async () => {
    const response = await agent.post('/graphql').send({
      query: GENERATE_BRIEF,
      variables: { input: {} },
    });
    expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
});

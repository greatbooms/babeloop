import { INestApplicationContext } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { VectorSearchRepository } from '../src/modules/creative-analysis/vector-search.repository';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
} from '../src/providers/embedding/embedding.provider';
import { createTestApp, createWorkerContext, stopContainers, TestApp } from './create-test-app';

const IMPORT = `mutation ImportPerformance($input: ImportPerformanceCsvInput!) {
  importPerformanceCsv(input: $input) {
    id importedRows updatedRows errorRows errors unmatchedTrackingCodes duplicateFile
  }
}`;
const PERFORMANCE = `query VariantPerformance($experimentId: ID!) {
  variantPerformance(experimentId: $experimentId) {
    trackingCode impressions clicks installs signups firstMessages cost
    ctr cpi signupsCoverage firstMessagesCoverage
  }
}`;
const FEEDBACK = `mutation Feedback($input: GenerateBriefFromPerformanceInput!) {
  generateBriefFromPerformance(input: $input) { job { id status } }
}`;

const HEADER =
  'date,platform,tracking_code,impressions,clicks,installs,signups,first_messages,cost,currency';

describe('performance', () => {
  let t: TestApp;
  let worker: INestApplicationContext;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  let experimentId: string;
  let userId: string;

  beforeAll(async () => {
    t = await createTestApp();
    worker = await createWorkerContext();
    prisma = t.app.get(PrismaService);
    const user = await prisma.user.upsert({
      where: { email: 'performance@test.local' },
      update: {},
      create: {
        email: 'performance@test.local',
        passwordHash: await argon2.hash('pw-123456'),
        displayName: 'Performance Editor',
        role: 'EDITOR',
      },
    });
    userId = user.id;
    agent = request.agent(t.app.getHttpServer());
    await agent.post('/graphql').send({
      query: `mutation { login(email: "performance@test.local", password: "pw-123456") { id } }`,
    });
    experimentId = await createExperimentFixture();
  });

  afterAll(async () => {
    if (worker) await worker.close();
    if (t) await t.teardown();
    await stopContainers();
  });

  async function createExperimentFixture() {
    const experiment = await prisma.experiment.create({ data: { code: 'PERF', name: '성과 테스트' } });
    const creativeTexts = ['가입이 강한 질문형 훅', '설치 중심 후기형 훅'];
    for (const [index, koreanText] of creativeTexts.entries()) {
      const brief = await prisma.creativeBrief.create({
        data: {
          title: `성과 브리프 ${index + 1}`,
          audienceHypothesis: '성인 사용자',
          desire: '몰입',
          hookType: index === 0 ? '질문형' : '후기형',
          messageAngle: '감정 중심',
          visualFormat: '채팅 캡처',
          callToAction: '무료 시작',
          rationale: '성과 통합 테스트',
          sourceAdIds: [],
          raw: {},
          provider: 'test',
          model: 'test',
          promptVersion: 'test@v1',
          createdById: userId,
        },
      });
      const creative = await prisma.generatedCreative.create({
        data: {
          briefId: brief.id,
          type: 'COPY',
          status: 'APPROVED',
          variantIndex: index + 1,
          hookType: index === 0 ? '질문형' : '후기형',
          koreanText,
          raw: {},
          provider: 'test',
          model: 'test',
          promptVersion: 'test@v1',
          createdById: userId,
        },
      });
      await prisma.experimentVariant.create({
        data: {
          experimentId: experiment.id,
          creativeId: creative.id,
          variantCode: `V${index + 1}`,
          trackingCode: `BL-PERF-V${index + 1}-R1`,
        },
      });
      if (index === 0) await createRagReference(koreanText);
    }
    return experiment.id;
  }

  async function createRagReference(inputText: string) {
    const sourceAd = await prisma.sourceAd.create({
      data: {
        origin: 'MANUAL_FILE',
        status: 'ANALYZED',
        title: '성과 환류 RAG 기준',
        adText: inputText,
        networks: [],
        countries: ['TW'],
        provider: 'manual',
      },
    });
    await prisma.creativeAnalysis.create({
      data: {
        sourceAdId: sourceAd.id,
        summary: '성과가 검증된 질문형 패턴과 유사한 경쟁 광고',
        hookType: '질문형',
        targetAudience: ['성인 사용자'],
        emotionalTriggers: ['호기심'],
        genres: ['로맨스'],
        language: 'ko-KR',
        raw: {},
        provider: 'test',
        model: 'test',
        promptVersion: 'test@v1',
      },
    });
    const embedder = t.app.get<EmbeddingProvider>(EMBEDDING_PROVIDER);
    const vectors = t.app.get(VectorSearchRepository);
    await vectors.upsertEmbedding({
      sourceAdId: sourceAd.id,
      model: embedder.model,
      dimension: embedder.dimension,
      vector: await embedder.embed(inputText),
    });
  }

  async function importCsv(filename: string, lines: string[]) {
    const fileBase64 = Buffer.from([HEADER, ...lines].join('\n'), 'utf8').toString('base64');
    return agent.post('/graphql').send({
      query: IMPORT,
      variables: { input: { filename, fileBase64 } },
    });
  }

  async function waitForJob(jobId: string) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (job?.status === 'SUCCEEDED') return job;
      if (job?.status === 'FAILED') throw new Error(`잡 실패: ${job.error}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`잡 완료 대기 시간 초과: ${jobId}`);
  }

  it('CSV 임포트·멱등·오류 처리와 성과 환류에서 null 의미론을 보존한다', async () => {
    const originalLines = [
      '2026-07-01,META,BL-PERF-V1-R1,1000,50,10,5,3,2500,TWD',
      '2026-07-01,META,BL-PERF-V2-R1,900,40,8,,,2200,TWD',
    ];
    const first = await importCsv('performance.csv', originalLines);
    expect(first.body.errors).toBeUndefined();
    expect(first.body.data.importPerformanceCsv).toEqual(
      expect.objectContaining({ importedRows: 2, updatedRows: 0, errorRows: 0, duplicateFile: false }),
    );
    const v2 = await prisma.performanceDaily.findUniqueOrThrow({
      where: {
        date_platform_trackingCode: {
          date: new Date('2026-07-01T00:00:00.000Z'),
          platform: 'META',
          trackingCode: 'BL-PERF-V2-R1',
        },
      },
    });
    expect(v2.signups).toBeNull();
    expect(v2.firstMessages).toBeNull();

    const dashboard = await agent.post('/graphql').send({
      query: PERFORMANCE,
      variables: { experimentId },
    });
    expect(dashboard.body.errors).toBeUndefined();
    const variants = dashboard.body.data.variantPerformance;
    expect(variants[0]).toEqual(
      expect.objectContaining({
        trackingCode: 'BL-PERF-V1-R1',
        signups: 5,
        signupsCoverage: 'FULL',
        ctr: 0.05,
        cpi: 250,
      }),
    );
    expect(variants[1]).toEqual(
      expect.objectContaining({
        trackingCode: 'BL-PERF-V2-R1',
        signups: null,
        signupsCoverage: 'MISSING',
      }),
    );

    const duplicate = await importCsv('performance-again.csv', originalLines);
    expect(duplicate.body.data.importPerformanceCsv).toEqual(
      expect.objectContaining({ importedRows: 0, updatedRows: 2, duplicateFile: true }),
    );
    expect(await prisma.performanceDaily.count()).toBe(2);

    const changed = await importCsv('performance-updated.csv', [
      '2026-07-01,META,BL-PERF-V1-R1,1000,50,12,5,3,2500,TWD',
    ]);
    expect(changed.body.data.importPerformanceCsv.updatedRows).toBe(1);
    expect(await prisma.performanceDaily.count()).toBe(2);
    expect(
      (
        await prisma.performanceDaily.findUniqueOrThrow({
          where: {
            date_platform_trackingCode: {
              date: new Date('2026-07-01T00:00:00.000Z'),
              platform: 'META',
              trackingCode: 'BL-PERF-V1-R1',
            },
          },
        })
      ).installs,
    ).toBe(12);

    const bad = await importCsv('performance-errors.csv', [
      '2026-07-02,META,invalid,100,10,2,1,1,50,TWD',
      '2026-07-02,META,BL-PERF-V1-R1,100,-1,2,1,1,50,TWD',
      '2026-07-02,GOOGLE,BL-PERF-V1-R1,100,10,2,1,1,50,TWD',
      '2026-07-02,META,BL-NONE-V1-R1,100,10,2,1,1,50,TWD',
    ]);
    expect(bad.body.data.importPerformanceCsv).toEqual(
      expect.objectContaining({
        importedRows: 1,
        errorRows: 3,
        unmatchedTrackingCodes: ['BL-NONE-V1-R1'],
      }),
    );
    expect(bad.body.data.importPerformanceCsv.errors).toEqual([
      expect.stringMatching(/행 2/),
      expect.stringMatching(/행 3/),
      expect.stringMatching(/행 4/),
    ]);

    const feedback = await agent.post('/graphql').send({
      query: FEEDBACK,
      variables: { input: { experimentId } },
    });
    expect(feedback.body.errors).toBeUndefined();
    const jobId = feedback.body.data.generateBriefFromPerformance.job.id as string;
    const job = await waitForJob(jobId);
    const briefId = (job.result as { briefId: string }).briefId;
    const brief = await prisma.creativeBrief.findUniqueOrThrow({ where: { id: briefId } });
    expect(brief.raw).toEqual(
      expect.objectContaining({
        performanceContext: expect.objectContaining({ trackingCode: 'BL-PERF-V1-R1' }),
      }),
    );
    expect(
      await prisma.aiExecutionLog.count({ where: { inputRef: `brief-request:${jobId}` } }),
    ).toBe(1);

    const noDataExperiment = await prisma.experiment.create({
      data: { code: 'EMPTY', name: '성과 없음' },
    });
    const existingVariant = await prisma.experimentVariant.findFirstOrThrow({
      where: { experimentId },
    });
    await prisma.experimentVariant.create({
      data: {
        experimentId: noDataExperiment.id,
        creativeId: existingVariant.creativeId,
        variantCode: 'V1',
        trackingCode: 'BL-EMPTY-V1-R1',
      },
    });
    const noData = await agent.post('/graphql').send({
      query: FEEDBACK,
      variables: { input: { experimentId: noDataExperiment.id } },
    });
    expect(noData.body.errors[0].extensions.code).toBe('NO_PERFORMANCE_DATA');
  });
});

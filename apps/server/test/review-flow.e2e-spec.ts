import { INestApplicationContext } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { StorageService } from '../src/common/storage/storage.service';
import { createTestApp, createWorkerContext, stopContainers, TestApp } from './create-test-app';

const RUN_POLICY = `mutation RunPolicy($input: CreativeIdInput!) {
  runPolicyCheck(input: $input) { id status }
}`;
const REQUEST_REVIEW = `mutation RequestReview($input: CreativeIdInput!) {
  requestCreativeReview(input: $input) { id status minorFlagged }
}`;
const REVISE_LOCALIZATION = `mutation Revise($input: ReviseLocalizationInput!) {
  reviseLocalization(input: $input) { id status }
}`;
const APPROVE_LOCALIZATION = `mutation ApproveLocalization($input: CreativeNoteInput!) {
  approveLocalization(input: $input) { id status }
}`;
const APPROVE_CREATIVE = `mutation ApproveCreative($input: CreativeNoteInput!) {
  approveCreative(input: $input) { id status }
}`;
const REQUEST_REVISION = `mutation RequestRevision($input: CreativeReasonInput!) {
  requestCreativeRevision(input: $input) { id status revision }
}`;
const RELEASE_MINOR = `mutation ReleaseMinor($input: CreativeReasonInput!) {
  releaseMinorFlag(input: $input) { id status minorFlagged minorFlagNote }
}`;
const UPDATE_TEXT = `mutation UpdateText($input: UpdateCreativeTextInput!) {
  updateCreativeText(input: $input) { id status revision lastEditedById }
}`;
const CREATE_EXPERIMENT = `mutation CreateExperiment($input: CreateExperimentInput!) {
  createExperiment(input: $input) { id code name }
}`;
const ADD_TO_EXPERIMENT = `mutation AddToExperiment($input: AddCreativeToExperimentInput!) {
  addCreativeToExperiment(input: $input) { id variantCode trackingCode creative { id status } }
}`;
const EXPORT_EXPERIMENT = `mutation ExportExperiment($input: ExportExperimentInput!) {
  exportExperiment(input: $input) {
    package { id experimentId }
    files { trackingCode filename url }
    manifestUrl
  }
}`;

describe('review flow', () => {
  let t: TestApp;
  let worker: INestApplicationContext;
  let prisma: PrismaService;
  let storage: StorageService;
  let editor: ReturnType<typeof request.agent>;
  let reviewer: ReturnType<typeof request.agent>;
  let editorId: string;
  let reviewerId: string;

  beforeAll(async () => {
    t = await createTestApp();
    worker = await createWorkerContext();
    prisma = t.app.get(PrismaService);
    storage = t.app.get(StorageService);
    editorId = await upsertUser('review-editor@test.local', 'EDITOR');
    reviewerId = await upsertUser('review-reviewer@test.local', 'REVIEWER');
    editor = await login('review-editor@test.local');
    reviewer = await login('review-reviewer@test.local');
  });

  afterAll(async () => {
    if (worker) await worker.close();
    if (t) await t.teardown();
    await stopContainers();
  });

  async function upsertUser(email: string, role: 'EDITOR' | 'REVIEWER') {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash: await argon2.hash('pw-123456'),
        displayName: role,
        role,
      },
    });
    return user.id;
  }

  async function login(email: string) {
    const agent = request.agent(t.app.getHttpServer());
    await agent.post('/graphql').send({
      query: `mutation { login(email: "${email}", password: "pw-123456") { id } }`,
    });
    return agent;
  }

  async function createCreative(options?: {
    koreanText?: string;
    status?: 'DRAFT' | 'APPROVED';
    approvedLocalization?: boolean;
    title?: string;
  }) {
    const brief = await prisma.creativeBrief.create({
      data: {
        title: options?.title ?? `검토 fixture ${Date.now()}-${Math.random()}`,
        audienceHypothesis: '성인 사용자',
        desire: '몰입',
        hookType: '질문형',
        messageAngle: '감정 중심',
        visualFormat: '채팅 캡처',
        callToAction: '무료 시작',
        rationale: '통합 테스트',
        sourceAdIds: [],
        raw: {},
        provider: 'test',
        model: 'test',
        promptVersion: 'test@v1',
        createdById: editorId,
      },
    });
    const creative = await prisma.generatedCreative.create({
      data: {
        briefId: brief.id,
        type: 'COPY',
        status: options?.status ?? 'DRAFT',
        variantIndex: 1,
        hookType: '질문형',
        koreanText: options?.koreanText ?? '새로운 이야기를 시작하세요',
        raw: {},
        provider: 'test',
        model: 'test',
        promptVersion: 'test@v1',
        createdById: editorId,
      },
    });
    await prisma.localizationVersion.create({
      data: {
        creativeId: creative.id,
        locale: 'zh-TW',
        kind: options?.approvedLocalization ? 'APPROVED' : 'AI_DRAFT',
        text: options?.approvedLocalization ? '已核准翻譯' : '[MOCK zh-TW] 初稿',
        reviewerId: options?.approvedLocalization ? reviewerId : null,
      },
    });
    return creative;
  }

  async function waitForJob(jobId: string) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const row = await prisma.job.findUnique({ where: { id: jobId } });
      if (row?.status === 'SUCCEEDED') return row;
      if (row?.status === 'FAILED') throw new Error(`잡 실패: ${row.error}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`잡 완료 대기 시간 초과: ${jobId}`);
  }

  async function policyAndReview(
    agent: ReturnType<typeof request.agent>,
    creativeId: string,
  ) {
    const policy = await agent.post('/graphql').send({
      query: RUN_POLICY,
      variables: { input: { creativeId } },
    });
    expect(policy.body.errors).toBeUndefined();
    await waitForJob(policy.body.data.runPolicyCheck.id);
    const review = await agent.post('/graphql').send({
      query: REQUEST_REVIEW,
      variables: { input: { creativeId } },
    });
    expect(review.body.errors).toBeUndefined();
    expect(review.body.data.requestCreativeReview.status).toBe('IN_REVIEW');
  }

  it('검토 게이트·수정 루프·추적코드 내보내기를 서버가 강제한다', async () => {
    const happy = await createCreative({ title: '행복 경로' });
    await policyAndReview(editor, happy.id);

    // 자기승인 금지의 진짜 검증: 역할 검사(FORBIDDEN)를 통과하는 REVIEWER 역할의 생성자여야 한다.
    // EDITOR 생성자는 역할 검사에서 먼저 걸리므로 (FORBIDDEN) — 그것도 확인.
    const editorApproval = await editor.post('/graphql').send({
      query: APPROVE_LOCALIZATION,
      variables: { input: { creativeId: happy.id } },
    });
    expect(editorApproval.body.errors[0].extensions.code).toBe('FORBIDDEN');

    await prisma.generatedCreative.update({ where: { id: happy.id }, data: { createdById: reviewerId } });
    const selfApproval = await reviewer.post('/graphql').send({
      query: APPROVE_LOCALIZATION,
      variables: { input: { creativeId: happy.id } },
    });
    expect(selfApproval.body.errors[0].extensions.code).toBe('SELF_APPROVAL_FORBIDDEN');
    await prisma.generatedCreative.update({ where: { id: happy.id }, data: { createdById: editorId } });

    const revised = await reviewer.post('/graphql').send({
      query: REVISE_LOCALIZATION,
      variables: { input: { creativeId: happy.id, text: '好的翻譯', note: '대만 표현 검수' } },
    });
    expect(revised.body.errors).toBeUndefined();
    const localizationApproval = await reviewer.post('/graphql').send({
      query: APPROVE_LOCALIZATION,
      variables: { input: { creativeId: happy.id, note: '현지화 승인' } },
    });
    expect(localizationApproval.body.data.approveLocalization.status).toBe('LOCALIZATION_APPROVED');
    const finalApproval = await reviewer.post('/graphql').send({
      query: APPROVE_CREATIVE,
      variables: { input: { creativeId: happy.id, note: '최종 승인' } },
    });
    expect(finalApproval.body.data.approveCreative.status).toBe('APPROVED');
    const happyEvents = await prisma.reviewRequest.findMany({
      where: { creativeId: happy.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(happyEvents.map((event) => event.kind)).toEqual([
      'POLICY_CHECKED',
      'REVIEW_REQUESTED',
      'LOCALIZATION_REVISED',
      'LOCALIZATION_APPROVED',
      'APPROVED',
    ]);
    const approvedLocalization = await prisma.localizationVersion.findFirstOrThrow({
      where: { creativeId: happy.id, kind: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(approvedLocalization.text).toBe('好的翻譯');
    expect(approvedLocalization.reviewerId).toBe(reviewerId);

    const localizationGate = await createCreative({ title: '현지화 게이트' });
    await policyAndReview(editor, localizationGate.id);
    const directApproval = await reviewer.post('/graphql').send({
      query: APPROVE_CREATIVE,
      variables: { input: { creativeId: localizationGate.id } },
    });
    expect(directApproval.body.errors[0].extensions.code).toBe('LOCALIZATION_GATE');

    const lastEditor = await createCreative({ title: '최종 수정자 자기승인' });
    const edited = await reviewer.post('/graphql').send({
      query: UPDATE_TEXT,
      variables: { input: { creativeId: lastEditor.id, koreanText: '검수자가 수정한 한국어' } },
    });
    expect(edited.body.data.updateCreativeText.lastEditedById).toBe(reviewerId);
    await policyAndReview(editor, lastEditor.id);
    const lastEditorApproval = await reviewer.post('/graphql').send({
      query: APPROVE_LOCALIZATION,
      variables: { input: { creativeId: lastEditor.id } },
    });
    expect(lastEditorApproval.body.errors[0].extensions.code).toBe('SELF_APPROVAL_FORBIDDEN');

    const minor = await createCreative({ koreanText: '교복 캐릭터와 대화하기', title: '미성년 게이트' });
    const minorPolicy = await editor.post('/graphql').send({
      query: RUN_POLICY,
      variables: { input: { creativeId: minor.id } },
    });
    await waitForJob(minorPolicy.body.data.runPolicyCheck.id);
    const checks = await prisma.policyCheck.findMany({ where: { creativeId: minor.id } });
    expect(checks).toHaveLength(3);
    expect(checks.find((check) => check.checkType === 'MINOR_SIGNAL')?.status).toBe('FLAGGED');
    expect((await prisma.generatedCreative.findUniqueOrThrow({ where: { id: minor.id } })).minorFlagged).toBe(true);
    const blockedReview = await editor.post('/graphql').send({
      query: REQUEST_REVIEW,
      variables: { input: { creativeId: minor.id } },
    });
    expect(blockedReview.body.errors[0].extensions.code).toBe('MINOR_FLAG_ACTIVE');
    const editorRelease = await editor.post('/graphql').send({
      query: RELEASE_MINOR,
      variables: { input: { creativeId: minor.id, reason: '사람 확인' } },
    });
    expect(editorRelease.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const reviewerRelease = await reviewer.post('/graphql').send({
      query: RELEASE_MINOR,
      variables: { input: { creativeId: minor.id, reason: '성인 캐릭터임을 원본에서 확인' } },
    });
    expect(reviewerRelease.body.data.releaseMinorFlag.minorFlagged).toBe(false);
    const releasedReview = await editor.post('/graphql').send({
      query: REQUEST_REVIEW,
      variables: { input: { creativeId: minor.id } },
    });
    expect(releasedReview.body.data.requestCreativeReview.status).toBe('IN_REVIEW');
    expect(
      await prisma.reviewRequest.count({
        where: { creativeId: minor.id, kind: 'MINOR_FLAG_RELEASED' },
      }),
    ).toBe(1);

    const illegal = await createCreative({ title: '불법 전이' });
    const illegalApproval = await reviewer.post('/graphql').send({
      query: APPROVE_CREATIVE,
      variables: { input: { creativeId: illegal.id } },
    });
    expect(illegalApproval.body.errors[0].extensions.code).toBe('ILLEGAL_TRANSITION');

    const revision = await createCreative({ title: '수정 요청 루프' });
    await policyAndReview(editor, revision.id);
    const requested = await reviewer.post('/graphql').send({
      query: REQUEST_REVISION,
      variables: { input: { creativeId: revision.id, reason: '훅을 명확하게' } },
    });
    expect(requested.body.data.requestCreativeRevision.status).toBe('REVISION_REQUESTED');
    const updated = await editor.post('/graphql').send({
      query: UPDATE_TEXT,
      variables: { input: { creativeId: revision.id, koreanText: '수정된 훅 문구' } },
    });
    expect(updated.body.data.updateCreativeText).toEqual(
      expect.objectContaining({ status: 'DRAFT', revision: 2, lastEditedById: editorId }),
    );

    const secondApproved = await createCreative({
      status: 'APPROVED',
      approvedLocalization: true,
      title: '내보내기 두 번째 소재',
    });
    const sharedImageKey = `review-flow/${happy.id}/shared.png`;
    const dedicatedImageKey = `review-flow/${happy.id}/dedicated.png`;
    await storage.putBuffer(sharedImageKey, Buffer.from('shared-brief-image'), 'image/png');
    await storage.putBuffer(dedicatedImageKey, Buffer.from('dedicated-copy-image'), 'image/png');
    await prisma.generatedImage.createMany({
      data: [
        {
          briefId: happy.briefId,
          storageKey: sharedImageKey,
          contentType: 'image/png',
          quality: 'low',
          instructions: '브리프 공용',
          prompt: 'shared',
          provider: 'mock',
          model: 'mock-image-1',
          promptVersion: 'generate-images@v2',
        },
        {
          briefId: happy.briefId,
          creativeId: happy.id,
          storageKey: dedicatedImageKey,
          contentType: 'image/png',
          quality: 'low',
          instructions: '문구 전용',
          prompt: 'dedicated',
          provider: 'mock',
          model: 'mock-image-1',
          promptVersion: 'generate-copy-images@v1',
        },
      ],
    });
    const experimentResponse = await reviewer.post('/graphql').send({
      query: CREATE_EXPERIMENT,
      variables: { input: { code: 'TW01', name: '검토 흐름 실험' } },
    });
    expect(experimentResponse.body.errors).toBeUndefined();
    const experimentId = experimentResponse.body.data.createExperiment.id as string;
    for (const creativeId of [happy.id, secondApproved.id]) {
      const add = await reviewer.post('/graphql').send({
        query: ADD_TO_EXPERIMENT,
        variables: { input: { experimentId, creativeId } },
      });
      expect(add.body.errors).toBeUndefined();
    }
    const exportResponse = await reviewer.post('/graphql').send({
      query: EXPORT_EXPERIMENT,
      variables: { input: { experimentId } },
    });
    expect(exportResponse.body.errors).toBeUndefined();
    const exported = exportResponse.body.data.exportExperiment;
    expect(exported.files.map((file: { trackingCode: string }) => file.trackingCode)).toEqual([
      'BL-TW01-V1-R1',
      'BL-TW01-V1-R1',
      'BL-TW01-V2-R1',
    ]);
    for (const file of exported.files as Array<{ trackingCode: string; filename: string; url: string }>) {
      const response = await fetch(file.url);
      expect(response.ok).toBe(true);
      if (file.filename.endsWith('.png')) {
        expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from('dedicated-copy-image'));
        continue;
      }
      const body = await response.text();
      expect(body).toContain(file.trackingCode);
      expect(body).toContain('--- zh-TW 승인본 ---');
      expect(body).toContain('영상: 없음');
    }
    expect(exported.files.map((file: { filename: string }) => file.filename)).toContain(
      'BL-TW01-V1-R1-IMG1.png',
    );
    const firstInstructionFile = exported.files.find(
      (file: { filename: string }) => file.filename === 'BL-TW01-V1-R1.txt',
    );
    expect(firstInstructionFile).toBeDefined();
    const firstInstructionBody = await (await fetch(firstInstructionFile!.url)).text();
    expect(firstInstructionBody).toContain('이미지: BL-TW01-V1-R1-IMG1.png');
    const manifestResponse = await fetch(exported.manifestUrl);
    const manifestBody = await manifestResponse.text();
    expect(manifestBody).toContain('광고 1개에 소재 1개만 연결할 것');
    expect(manifestBody).toContain(
      'trackingCode,adName,utmContent,filename,imageFilenames,videoFilenames',
    );
    expect(manifestBody).toContain('"BL-TW01-V1-R1-IMG1.png"');
    const exportedCreatives = await prisma.generatedCreative.findMany({
      where: { id: { in: [happy.id, secondApproved.id] } },
    });
    expect(exportedCreatives.every((creative) => creative.status === 'APPROVED')).toBe(true);
    const firstVariantExports = await prisma.experimentVariant.findMany({
      where: { experimentId },
      orderBy: { variantCode: 'asc' },
      select: { id: true, exportedAt: true },
    });
    expect(firstVariantExports).toHaveLength(2);
    expect(firstVariantExports.every((variant) => variant.exportedAt !== null)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const reexportResponse = await reviewer.post('/graphql').send({
      query: EXPORT_EXPERIMENT,
      variables: { input: { experimentId } },
    });
    expect(reexportResponse.body.errors).toBeUndefined();
    const reexported = reexportResponse.body.data.exportExperiment;
    expect(reexported.package.id).not.toBe(exported.package.id);
    expect(reexported.files.map((file: { trackingCode: string }) => file.trackingCode)).toEqual([
      'BL-TW01-V1-R1',
      'BL-TW01-V1-R1',
      'BL-TW01-V2-R1',
    ]);
    const secondVariantExports = await prisma.experimentVariant.findMany({
      where: { experimentId },
      orderBy: { variantCode: 'asc' },
      select: { id: true, exportedAt: true },
    });
    expect(secondVariantExports).toHaveLength(2);
    for (const [index, variant] of secondVariantExports.entries()) {
      expect(variant.id).toBe(firstVariantExports[index].id);
      expect(variant.exportedAt!.getTime()).toBeGreaterThan(
        firstVariantExports[index].exportedAt!.getTime(),
      );
    }

    const immutable = await editor.post('/graphql').send({
      query: UPDATE_TEXT,
      variables: { input: { creativeId: happy.id, koreanText: '내보낸 뒤 수정' } },
    });
    expect(immutable.body.errors[0].extensions.code).toBe('ILLEGAL_TRANSITION');
    const notApproved = await reviewer.post('/graphql').send({
      query: ADD_TO_EXPERIMENT,
      variables: { input: { experimentId, creativeId: illegal.id } },
    });
    expect(notApproved.body.errors[0].extensions.code).toBe('NOT_APPROVED');
  });
});

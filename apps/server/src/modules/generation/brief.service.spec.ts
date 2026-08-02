import { BriefService } from './brief.service';

describe('BriefService relationships', () => {
  it('삭제된 광고는 titleSnapshot과 deleted를 매핑한다', async () => {
    const brief = { id: 'brief-1', raw: {}, sourceAdIds: ['ad-1'], references: [{ sourceAdId: null, titleSnapshot: '광고 하나', method: 'UNKNOWN', similarity: null, sourceAd: null }], creatives: [] };
    const prisma = {
      creativeBrief: { findMany: jest.fn().mockResolvedValue([brief]) },
    };
    const service = new BriefService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({ references: [expect.objectContaining({ title: '광고 하나', deleted: true })] }),
    ]);
  });
});

describe('BriefService.requestImages', () => {
  function setup() {
    const prisma = {
      creativeBrief: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'brief-1' }) },
    };
    const queue = { name: 'creative-generation' };
    const jobRecord = {
      enqueueOrRetry: jest.fn().mockResolvedValue({ id: 'generate-images--brief-1--request-1' }),
    };
    const service = new BriefService(
      prisma as never,
      jobRecord as never,
      {} as never,
      queue as never,
      {} as never,
    );
    return { service, queue, jobRecord };
  }

  it.each([0, 5])('장수가 %i이면 BAD_USER_INPUT으로 거부한다', async (count) => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestImages({ briefId: 'brief-1', instructions: '', count, quality: 'low' }),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('low/high 외 품질은 BAD_USER_INPUT으로 거부한다', async () => {
    const { service, jobRecord } = setup();

    await expect(
      service.requestImages({
        briefId: 'brief-1',
        instructions: '',
        count: 2,
        quality: 'ultra',
      }),
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('generate-images--{briefId}--{uuid} 잡을 enqueueOrRetry로 등록한다', async () => {
    const { service, queue, jobRecord } = setup();

    await expect(
      service.requestImages({
        briefId: 'brief-1',
        instructions: '분홍색 네온 조명',
        count: 2,
        quality: 'high',
      }),
    ).resolves.toEqual({ id: 'generate-images--brief-1--request-1' });

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      queue,
      'creative-generation',
      'generate-images',
      expect.stringMatching(/^generate-images--brief-1--[0-9a-f-]+$/),
      {
        briefId: 'brief-1',
        instructions: '분홍색 네온 조명',
        count: 2,
        quality: 'high',
      },
    );
  });
});

describe('BriefService approved creative generation', () => {
  function setup(creative: { id: string; briefId: string; type: string; status: string }) {
    const prisma = {
      generatedCreative: { findUnique: jest.fn().mockResolvedValue(creative) },
    };
    const queue = { name: 'creative-generation' };
    const jobRecord = {
      enqueueOrRetry: jest.fn().mockResolvedValue({ id: 'queued-job' }),
    };
    const service = new BriefService(
      prisma as never,
      jobRecord as never,
      {} as never,
      queue as never,
      {} as never,
    );
    return { service, queue, jobRecord };
  }

  it('APPROVED COPY의 전용 이미지 잡을 creativeId 포함 payload로 등록한다', async () => {
    const { service, queue, jobRecord } = setup({
      id: 'creative-copy-1',
      briefId: 'brief-1',
      type: 'COPY',
      status: 'APPROVED',
    });

    await expect(service.requestCreativeImages({
      creativeId: 'creative-copy-1',
      instructions: '따뜻한 조명',
      count: 2,
      quality: 'high',
    })).resolves.toEqual({ id: 'queued-job' });

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      queue,
      'creative-generation',
      'generate-images',
      expect.stringMatching(/^generate-images--creative-copy-1--[0-9a-f-]+$/),
      {
        briefId: 'brief-1',
        creativeId: 'creative-copy-1',
        instructions: '따뜻한 조명',
        count: 2,
        quality: 'high',
      },
    );
  });

  it('APPROVED COPY가 아니면 전용 이미지 생성을 거부한다', async () => {
    const { service, jobRecord } = setup({
      id: 'creative-video-1',
      briefId: 'brief-1',
      type: 'VIDEO_SCRIPT',
      status: 'APPROVED',
    });

    await expect(service.requestCreativeImages({
      creativeId: 'creative-video-1',
      instructions: '',
      count: 2,
      quality: 'low',
    })).rejects.toThrow('APPROVED 문구에서만 생성할 수 있습니다');
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });

  it('APPROVED VIDEO_SCRIPT의 영상 잡을 enqueueOrRetry로 등록한다', async () => {
    const { service, queue, jobRecord } = setup({
      id: 'creative-video-1',
      briefId: 'brief-1',
      type: 'VIDEO_SCRIPT',
      status: 'APPROVED',
    });

    await expect(service.requestCreativeVideo({
      creativeId: 'creative-video-1',
      seconds: 12,
      instructions: '영화적인 조명',
    })).resolves.toEqual({ id: 'queued-job' });

    expect(jobRecord.enqueueOrRetry).toHaveBeenCalledWith(
      queue,
      'creative-generation',
      'generate-video',
      expect.stringMatching(/^generate-video--creative-video-1--[0-9a-f-]+$/),
      {
        creativeId: 'creative-video-1',
        seconds: 12,
        instructions: '영화적인 조명',
      },
    );
  });

  it('4/8/12초 외 영상 길이를 거부한다', async () => {
    const { service, jobRecord } = setup({
      id: 'creative-video-1',
      briefId: 'brief-1',
      type: 'VIDEO_SCRIPT',
      status: 'APPROVED',
    });

    await expect(service.requestCreativeVideo({
      creativeId: 'creative-video-1',
      seconds: 6,
      instructions: '',
    })).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    expect(jobRecord.enqueueOrRetry).not.toHaveBeenCalled();
  });
});

import { DEFAULT_JOB_OPTS, JobRecordService } from './job-record.service';

describe('JobRecordService.enqueueOrRetry', () => {
  function setup(existingJob?: { getState: () => Promise<string>; retry: jest.Mock }) {
    const upsert = jest.fn().mockResolvedValue({ id: 'job-1', status: 'QUEUED' });
    const update = jest.fn().mockResolvedValue({ id: 'job-1', status: 'QUEUED' });
    const prisma = { job: { upsert, update } };
    const queue = {
      add: jest.fn().mockResolvedValue({}),
      getJob: jest.fn().mockResolvedValue(existingJob),
    };
    const service = new JobRecordService(prisma as never);
    return { service, queue, upsert, update };
  }

  it('기존 잡이 없으면 add + enqueue 기록', async () => {
    const { service, queue, upsert } = setup(undefined);
    await service.enqueueOrRetry(queue as never, 'q', 'job-type', 'job-1', { a: 1 });
    expect(queue.add).toHaveBeenCalledWith('job-type', { a: 1 }, { jobId: 'job-1', ...DEFAULT_JOB_OPTS });
    expect(upsert).toHaveBeenCalled();
  });

  it('실패한 잡은 retry()로 되살리고 requeue 기록 (add 안 함)', async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    const { service, queue, update } = setup({ getState: async () => 'failed', retry });
    await service.enqueueOrRetry(queue as never, 'q', 'job-type', 'job-1', { a: 1 });
    expect(retry).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'QUEUED', error: null, finishedAt: null },
    });
  });

  it('대기·실행 중인 잡은 건드리지 않는다 (중복 등록 방지)', async () => {
    const retry = jest.fn();
    const { service, queue } = setup({ getState: async () => 'waiting', retry });
    await service.enqueueOrRetry(queue as never, 'q', 'job-type', 'job-1', { a: 1 });
    expect(retry).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});

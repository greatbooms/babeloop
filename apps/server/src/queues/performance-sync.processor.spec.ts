import { MockPerfSourceProvider } from '../providers/perf-source/mock-perf-source.provider';
import { PerformanceSyncProcessor } from './performance-sync.processor';
import { JOB_TYPES } from './queue.constants';

describe('PerformanceSyncProcessor', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('mock 소스 2행을 10열 CSV로 바꿔 기존 성과 임포트에 전달한다', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-03T00:00:00.000Z'));
    const source = new MockPerfSourceProvider();
    const user = { id: 'user-1' };
    const prisma = { user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user) } };
    const performance = {
      importCsv: jest.fn().mockResolvedValue({
        importedRows: 1,
        updatedRows: 1,
        unmatchedTrackingCodes: ['BL-MOCK-V2-R1'],
      }),
    };
    const jobRecord = {
      enqueue: jest.fn(),
      markRunning: jest.fn(),
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
    };
    const processor = new PerformanceSyncProcessor(
      source,
      performance as never,
      prisma as never,
      jobRecord as never,
    );

    await processor.process({
      id: 'sync-performance--request-1',
      name: JOB_TYPES.SYNC_PERFORMANCE,
      data: { from: '2026-07-21', to: '2026-08-03', requestedById: 'user-1' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as never);

    const expectedCsv = [
      'date,platform,tracking_code,impressions,clicks,installs,signups,first_messages,cost,currency',
      '2026-08-03,OTHER,BL-MOCK-V1-R1,,,,3,,,TWD',
      '2026-08-03,OTHER,BL-MOCK-V2-R1,,,,1,,,TWD',
      '',
    ].join('\n');
    expect(performance.importCsv).toHaveBeenCalledWith(
      user,
      Buffer.from(expectedCsv).toString('base64'),
      'snowflake-sync-2026-07-21_2026-08-03.csv',
    );
    expect(jobRecord.markSucceeded).toHaveBeenCalledWith('sync-performance--request-1', {
      rows: 2,
      importedRows: 1,
      updatedRows: 1,
      unmatched: 1,
    });
  });
});

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { User } from '../../generated/prisma';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobRecordService } from '../modules/jobs/job-record.service';
import { PerformanceService } from '../modules/performance/performance.service';
import {
  PERF_SOURCE_PROVIDER,
  PerfSourceProvider,
} from '../providers/perf-source/perf-source.provider';
import {
  JOB_TYPES,
  PERFORMANCE_SYNC_QUEUE,
  recentPerformanceSyncRange,
} from './queue.constants';

export interface PerformanceSyncJobData {
  from?: string;
  to?: string;
  requestedById?: string;
  scheduled?: boolean;
}

const CSV_HEADER = 'date,platform,tracking_code,impressions,clicks,installs,signups,first_messages,cost,currency';

@Processor(PERFORMANCE_SYNC_QUEUE)
export class PerformanceSyncProcessor extends WorkerHost {
  constructor(
    @Inject(PERF_SOURCE_PROVIDER) private readonly source: PerfSourceProvider,
    private readonly performanceService: PerformanceService,
    private readonly prisma: PrismaService,
    private readonly jobRecord: JobRecordService,
  ) {
    super();
  }

  async process(job: BullJob<PerformanceSyncJobData>): Promise<void> {
    const jobId = job.id!;
    const range = job.data.from && job.data.to
      ? { from: job.data.from, to: job.data.to }
      : recentPerformanceSyncRange();
    const payload = { ...job.data, ...range };
    await this.jobRecord.enqueue(jobId, PERFORMANCE_SYNC_QUEUE, JOB_TYPES.SYNC_PERFORMANCE, payload);
    await this.jobRecord.markRunning(jobId);

    try {
      const rows = await this.source.fetchSignups(range);
      if (rows.length === 0) {
        await this.jobRecord.markSucceeded(jobId, {
          rows: 0,
          importedRows: 0,
          updatedRows: 0,
          unmatched: 0,
        });
        return;
      }

      const user = await this.resolveUser(job.data.requestedById);
      const lines = rows.map((row) =>
        `${row.date},OTHER,${row.trackingCode},,,,${row.signups},,,TWD`);
      const csv = [CSV_HEADER, ...lines].join('\n') + '\n';
      const result = await this.performanceService.importCsv(
        user,
        Buffer.from(csv, 'utf8').toString('base64'),
        `snowflake-sync-${range.from}_${range.to}.csv`,
      );
      await this.jobRecord.markSucceeded(jobId, {
        rows: rows.length,
        importedRows: result.importedRows,
        updatedRows: result.updatedRows,
        unmatched: result.unmatchedTrackingCodes.length,
      });
    } catch (error) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.jobRecord.markFailed(
          jobId,
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  }

  private async resolveUser(requestedById?: string): Promise<User> {
    if (requestedById) {
      return this.prisma.user.findUniqueOrThrow({ where: { id: requestedById } });
    }
    const systemUser = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
    });
    if (!systemUser) throw new Error('Snowflake 성과 동기화에 사용할 ADMIN 사용자가 없습니다');
    return systemUser;
  }
}

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DEFAULT_JOB_OPTS } from '../modules/jobs/job-record.service';
import {
  PERF_SOURCE_PROVIDER,
  PerfSourceProvider,
} from '../providers/perf-source/perf-source.provider';
import {
  JOB_TYPES,
  PERFORMANCE_SYNC_QUEUE,
  PERFORMANCE_SYNC_TIMEZONE,
  performanceSyncCron,
  syncPerformanceJobId,
} from './queue.constants';

@Injectable()
export class PerformanceSyncScheduler implements OnApplicationBootstrap {
  constructor(
    @Inject(PERF_SOURCE_PROVIDER) private readonly source: PerfSourceProvider,
    @InjectQueue(PERFORMANCE_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const cron = performanceSyncCron();
    if (!this.source.configured || !cron) return;

    const jobId = syncPerformanceJobId('cron');
    const repeat = { pattern: cron, tz: PERFORMANCE_SYNC_TIMEZONE };
    await this.queue.removeRepeatable(JOB_TYPES.SYNC_PERFORMANCE, repeat, jobId);
    await this.queue.add(
      JOB_TYPES.SYNC_PERFORMANCE,
      { scheduled: true },
      { jobId, repeat, ...DEFAULT_JOB_OPTS },
    );
  }
}

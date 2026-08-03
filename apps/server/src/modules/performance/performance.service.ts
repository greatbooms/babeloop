import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { GraphQLError } from 'graphql';
import { Prisma, User } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JobRecordService } from '../jobs/job-record.service';
import {
  PERF_SOURCE_PROVIDER,
  PerfSourceProvider,
} from '../../providers/perf-source/perf-source.provider';
import {
  JOB_TYPES,
  PERFORMANCE_SYNC_QUEUE,
  performanceSyncCron,
  recentPerformanceSyncRange,
  syncPerformanceJobId,
} from '../../queues/queue.constants';
import { parsePerformanceCsv } from './performance-csv.parser';
import { SyncPerformanceFromSnowflakeInput } from './performance.inputs';
import { PerformanceCoverage } from './performance.models';

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PERFORMANCE_SYNC_QUEUE) private readonly syncQueue: Queue,
    private readonly jobRecord: JobRecordService,
    @Inject(PERF_SOURCE_PROVIDER) private readonly perfSource: PerfSourceProvider,
  ) {}

  async syncFromSnowflake(user: User, input?: SyncPerformanceFromSnowflakeInput) {
    if (!this.perfSource.configured) {
      throw new GraphQLError('Snowflake 자격증명이 설정되지 않았습니다', {
        extensions: { code: 'NOT_CONFIGURED' },
      });
    }

    const range = this.resolveSyncRange(input);
    const jobId = syncPerformanceJobId(randomUUID());
    const payload = { ...range, requestedById: user.id };
    return this.jobRecord.enqueueOrRetry(
      this.syncQueue,
      PERFORMANCE_SYNC_QUEUE,
      JOB_TYPES.SYNC_PERFORMANCE,
      jobId,
      payload,
    );
  }

  async performanceSyncStatus() {
    const latest = await this.prisma.performanceImport.findFirst({
      where: { filename: { startsWith: 'snowflake-sync-' } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return {
      configured: this.perfSource.configured,
      provider: this.perfSource.name,
      cron: performanceSyncCron(),
      lastSyncedAt: latest?.createdAt ?? null,
    };
  }

  async importCsv(user: User, fileBase64: string, filename: string) {
    const buffer = Buffer.from(fileBase64, 'base64');
    const fileHash = createHash('sha256').update(buffer).digest('hex');
    const duplicateFile = Boolean(
      await this.prisma.performanceImport.findFirst({ where: { fileHash } }),
    );
    const parsed = parsePerformanceCsv(buffer);
    const unmatchedTrackingCodes = new Set<string>();
    let importedRows = 0;
    let updatedRows = 0;

    for (const row of parsed.rows) {
      const variant = await this.prisma.experimentVariant.findUnique({
        where: { trackingCode: row.trackingCode },
      });
      if (!variant) unmatchedTrackingCodes.add(row.trackingCode);
      const key = {
        date: row.date,
        platform: row.platform,
        trackingCode: row.trackingCode,
      };
      const existing = await this.prisma.performanceDaily.findUnique({
        where: { date_platform_trackingCode: key },
      });
      const metrics = {
        experimentVariantId: variant?.id ?? null,
        impressions: row.impressions,
        clicks: row.clicks,
        installs: row.installs,
        signups: row.signups,
        firstMessages: row.firstMessages,
        cost: row.cost,
        currency: row.currency,
      };
      await this.prisma.performanceDaily.upsert({
        where: { date_platform_trackingCode: key },
        update: metrics,
        create: {
          ...key,
          ...metrics,
          provider: 'csv',
          isEstimated: false,
          confidence: 'HIGH',
        },
      });
      if (existing) updatedRows++;
      else importedRows++;
    }

    const errorDetails: Prisma.InputJsonObject[] = parsed.errors.map((error) => {
      const match = /^행 (\d+): (.*)$/.exec(error);
      return match
        ? { row: Number(match[1]), message: match[2] }
        : { row: null, message: error };
    });
    const unmatched = [...unmatchedTrackingCodes];
    const imported = await this.prisma.performanceImport.create({
      data: {
        filename,
        fileHash,
        importedRows,
        updatedRows,
        errorRows: parsed.errors.length,
        errors: errorDetails,
        unmatchedTrackingCodes: unmatched,
        createdById: user.id,
      },
    });
    return {
      id: imported.id,
      importedRows,
      updatedRows,
      errorRows: parsed.errors.length,
      errors: parsed.errors,
      unmatchedTrackingCodes: unmatched,
      duplicateFile,
    };
  }

  async variantPerformance(experimentId: string) {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: {
        variants: {
          include: {
            creative: true,
            performance: { orderBy: { date: 'asc' } },
          },
        },
      },
    });
    if (!experiment) throw new NotFoundException('실험을 찾을 수 없습니다');

    return experiment.variants
      .map((variant) => {
        const rows = variant.performance;
        const impressions = this.sumNullable(rows.map((row) => row.impressions));
        const clicks = this.sumNullable(rows.map((row) => row.clicks));
        const installs = this.sumNullable(rows.map((row) => row.installs));
        const signups = this.sumNullable(rows.map((row) => row.signups));
        const firstMessages = this.sumNullable(rows.map((row) => row.firstMessages));
        const cost = this.sumNullable(
          rows.map((row) => (row.cost === null ? null : Number(row.cost))),
        );
        const currencies = [...new Set(rows.map((row) => row.currency))];
        return {
          experimentVariantId: variant.id,
          creativeId: variant.creative.id,
          variantCode: variant.variantCode,
          trackingCode: variant.trackingCode,
          hookType: variant.creative.hookType,
          koreanTextSummary: variant.creative.koreanText.slice(0, 60),
          status: variant.creative.status,
          impressions,
          clicks,
          installs,
          signups,
          firstMessages,
          cost,
          currency: currencies.length === 1 ? currencies[0] : currencies.length === 0 ? 'TWD' : 'MIXED',
          ctr: this.divide(clicks, impressions),
          cpi: this.divide(cost, installs),
          costPerSignup: this.divide(cost, signups),
          installToSignupRate: this.divide(signups, installs),
          signupToFirstMessageRate: this.divide(firstMessages, signups),
          signupsCoverage: this.coverage(rows.map((row) => row.signups)),
          firstMessagesCoverage: this.coverage(rows.map((row) => row.firstMessages)),
        };
      })
      .sort((left, right) => {
        if (left.signups === null && right.signups !== null) return 1;
        if (left.signups !== null && right.signups === null) return -1;
        if (left.signups !== right.signups) return (right.signups ?? 0) - (left.signups ?? 0);
        if (left.installs === null && right.installs !== null) return 1;
        if (left.installs !== null && right.installs === null) return -1;
        return (right.installs ?? 0) - (left.installs ?? 0);
      });
  }

  async findImports() {
    const imports = await this.prisma.performanceImport.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return imports.map((item) => ({
      ...item,
      errors: this.errorMessages(item.errors),
    }));
  }

  private sumNullable(values: Array<number | null>): number | null {
    const available = values.filter((value): value is number => value !== null);
    return available.length === 0 ? null : available.reduce((sum, value) => sum + value, 0);
  }

  private divide(numerator: number | null, denominator: number | null): number | null {
    if (numerator === null || denominator === null || denominator === 0) return null;
    return numerator / denominator;
  }

  private coverage(values: Array<number | null>): PerformanceCoverage {
    const available = values.filter((value) => value !== null).length;
    if (available === 0) return PerformanceCoverage.MISSING;
    if (available === values.length) return PerformanceCoverage.FULL;
    return PerformanceCoverage.PARTIAL;
  }

  private errorMessages(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const row = 'row' in item ? item.row : null;
        const message = 'message' in item ? item.message : String(item);
        return row ? `행 ${row}: ${String(message)}` : String(message);
      }
      return String(item);
    });
  }

  private resolveSyncRange(input?: SyncPerformanceFromSnowflakeInput): { from: string; to: string } {
    const recent = recentPerformanceSyncRange();
    const to = input?.to ?? recent.to;
    const from = input?.from ?? (input?.to ? this.daysBefore(to, 13) : recent.from);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      throw new GraphQLError('동기화 날짜 범위가 올바르지 않습니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    return { from, to };
  }

  private daysBefore(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() - days);
    return value.toISOString().slice(0, 10);
  }
}

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { GraphQLError } from 'graphql';
import { User } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CREATIVE_GENERATION_QUEUE,
  generateBriefJobId,
  generateCopyVariantsJobId,
  JOB_TYPES,
} from '../../queues/queue.constants';
import { JobRecordService } from '../jobs/job-record.service';
import { PerformanceService } from '../performance/performance.service';
import {
  GenerateCreativeBriefInput,
  GenerateCreativeVariantsInput,
} from './brief.inputs';

export const BRIEF_INCLUDE = {
  brand: true,
  references: { orderBy: { rank: 'asc' as const }, include: { sourceAd: { select: { id: true, title: true } } } },
  creatives: {
    orderBy: { variantIndex: 'asc' as const },
    include: { localizations: { orderBy: { createdAt: 'desc' as const } } },
  },
} as const;

@Injectable()
export class BriefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobRecord: JobRecordService,
    private readonly performance: PerformanceService,
    @InjectQueue(CREATIVE_GENERATION_QUEUE) private readonly queue: Queue,
  ) {}

  async requestBrief(user: User, input: GenerateCreativeBriefInput) {
    if (!input.focusText && (!input.sourceAdIds || input.sourceAdIds.length === 0)) {
      throw new GraphQLError('focusText 또는 sourceAdIds 중 하나는 필요합니다', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
    const requestId = randomUUID();
    const jobId = generateBriefJobId(requestId);
    const payload = {
      title: input.title ?? null,
      focusText: input.focusText ?? null,
      brandId: input.brandId ?? null,
      sourceAdIds: input.sourceAdIds ?? [],
      createdById: user.id,
    };
    await this.queue.add(JOB_TYPES.GENERATE_BRIEF, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    const job = await this.jobRecord.enqueue(
      jobId,
      CREATIVE_GENERATION_QUEUE,
      JOB_TYPES.GENERATE_BRIEF,
      payload,
    );
    return { job };
  }

  async requestVariants(input: GenerateCreativeVariantsInput) {
    await this.prisma.creativeBrief.findUniqueOrThrow({ where: { id: input.briefId } }).catch(() => {
      throw new GraphQLError('브리프를 찾을 수 없습니다', { extensions: { code: 'NOT_FOUND' } });
    });
    const jobId = generateCopyVariantsJobId(input.briefId, randomUUID());
    const payload = { briefId: input.briefId, type: input.type, count: input.count };
    await this.queue.add(JOB_TYPES.GENERATE_COPY_VARIANTS, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    const job = await this.jobRecord.enqueue(
      jobId,
      CREATIVE_GENERATION_QUEUE,
      JOB_TYPES.GENERATE_COPY_VARIANTS,
      payload,
    );
    return { job };
  }

  async requestBriefFromPerformance(user: User, experimentId: string) {
    const ranked = await this.performance.variantPerformance(experimentId);
    const top =
      ranked.find((variant) => variant.signups !== null) ??
      ranked.find((variant) => variant.installs !== null);
    if (!top) {
      throw new GraphQLError('브리프에 환류할 성과 데이터가 없습니다', {
        extensions: { code: 'NO_PERFORMANCE_DATA' },
      });
    }
    const creative = await this.prisma.generatedCreative.findUniqueOrThrow({
      where: { id: top.creativeId },
      include: { brief: true },
    });
    const performanceContext = {
      trackingCode: top.trackingCode,
      hookType: creative.hookType,
      koreanText: creative.koreanText,
      signups: top.signups,
      installs: top.installs,
      clicks: top.clicks,
      impressions: top.impressions,
    };
    const jobId = generateBriefJobId(randomUUID());
    const payload = {
      title: null,
      focusText: creative.koreanText,
      brandId: creative.brief.brandId,
      sourceAdIds: [],
      createdById: user.id,
      performanceContext,
    };
    await this.queue.add(JOB_TYPES.GENERATE_BRIEF, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    const job = await this.jobRecord.enqueue(
      jobId,
      CREATIVE_GENERATION_QUEUE,
      JOB_TYPES.GENERATE_BRIEF,
      payload,
    );
    return { job };
  }

  async findAll() {
    const briefs = await this.prisma.creativeBrief.findMany({
      include: BRIEF_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return briefs.map((brief) => this.mapBrief(brief));
  }

  async findById(id: string) {
    const brief = await this.prisma.creativeBrief.findUnique({ where: { id }, include: BRIEF_INCLUDE });
    if (!brief) throw new NotFoundException('브리프를 찾을 수 없습니다');
    return this.mapBrief(brief);
  }

  private mapBrief<T extends { raw: unknown; zhTwFields?: unknown; references: Array<{ sourceAdId: string | null; titleSnapshot: string | null; method: string; similarity: number | null; sourceAd: { id: string; title: string | null } | null }>; creatives: Array<{ scenes: unknown }> }>(brief: T) {
    return {
      ...brief,
      references: brief.references.map((reference) => ({ sourceAdId: reference.sourceAdId, title: reference.sourceAd?.title ?? reference.titleSnapshot, method: reference.method, similarity: reference.similarity, deleted: reference.sourceAd === null })),
      rawJson: JSON.stringify(brief.raw),
      zhTwJson: brief.zhTwFields ? JSON.stringify(brief.zhTwFields) : null,
      creatives: brief.creatives.map((creative) => ({
        ...creative,
        scenesJson: creative.scenes ? JSON.stringify(creative.scenes) : null,
      })),
    };
  }
}

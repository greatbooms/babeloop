import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { GraphQLError } from 'graphql';
import { CreativeStatus, CreativeType, ReviewEventKind, User } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import {
  JOB_TYPES,
  backTranslateJobId,
  LOCALIZATION_QUEUE,
  localizeZhTwJobId,
  POLICY_CHECK_QUEUE,
  runPolicyCheckJobId,
} from '../../queues/queue.constants';
import { JobRecordService } from '../jobs/job-record.service';
import { assertTransition, TransitionContext } from './creative-state-machine';

export const REVIEW_INCLUDE = {
  brief: true,
  localizations: { orderBy: { createdAt: 'desc' as const } },
  policyChecks: { orderBy: { createdAt: 'desc' as const } },
  reviewEvents: { orderBy: { createdAt: 'desc' as const } },
  experimentVariants: { orderBy: { createdAt: 'asc' as const } },
} as const;

export const REVIEW_DETAIL_INCLUDE = {
  ...REVIEW_INCLUDE,
  brief: {
    include: {
      references: {
        orderBy: { rank: 'asc' as const },
        include: {
          sourceAd: {
            include: {
              mediaAsset: {
                select: { kind: true, storageKey: true, thumbnailKey: true },
              },
            },
          },
        },
      },
    },
  },
  images: { orderBy: { createdAt: 'desc' as const } },
  videos: { orderBy: { createdAt: 'desc' as const } },
} as const;

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobRecord: JobRecordService,
    @InjectQueue(POLICY_CHECK_QUEUE) private readonly policyQueue: Queue,
    @InjectQueue(LOCALIZATION_QUEUE) private readonly localizationQueue: Queue,
    private readonly storage: StorageService,
  ) {}

  async runPolicyCheck(user: User, creativeId: string) {
    const creative = await this.load(creativeId);
    assertTransition(this.context(creative, user), 'POLICY_CHECKED');
    const jobId = runPolicyCheckJobId(creativeId);
    const payload = { creativeId, requestedById: user.id };
    await this.policyQueue.add(JOB_TYPES.RUN_POLICY_CHECK, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    return this.jobRecord.enqueue(jobId, POLICY_CHECK_QUEUE, JOB_TYPES.RUN_POLICY_CHECK, payload);
  }

  requestReview(user: User, creativeId: string) {
    return this.transition(user, creativeId, 'IN_REVIEW', 'REVIEW_REQUESTED');
  }

  async reviseLocalization(user: User, creativeId: string, text: string, note?: string) {
    const creative = await this.load(creativeId);
    if (creative.status !== 'IN_REVIEW') {
      this.fail('IN_REVIEW 상태에서만 현지화를 수정할 수 있습니다', 'ILLEGAL_TRANSITION');
    }
    if (!text.trim()) this.fail('현지화 텍스트는 비어 있을 수 없습니다', 'BAD_USER_INPUT');
    const localization = await this.prisma.localizationVersion.create({
      data: {
        creativeId,
        locale: 'zh-TW',
        kind: 'HUMAN_REVISED',
        text,
        notes: note,
        reviewerId: user.id,
      },
    });
    // 수정본을 한국어로 역번역(참고용) — 한국 작업자가 검수자의 변경 내용을 읽을 수 있게 (AI, ~1센트 미만)
    await this.jobRecord.enqueueOrRetry(
      this.localizationQueue,
      LOCALIZATION_QUEUE,
      JOB_TYPES.BACK_TRANSLATE_KO,
      backTranslateJobId(localization.id),
      { localizationId: localization.id },
    );
    await this.recordEvent(creativeId, 'LOCALIZATION_REVISED', user.id, note);
    return this.findById(creativeId);
  }

  async approveLocalization(user: User, creativeId: string, note?: string) {
    const creative = await this.load(creativeId);
    assertTransition(this.context(creative, user), 'LOCALIZATION_APPROVED');
    const source =
      creative.localizations.find(
        (item) => item.locale === 'zh-TW' && item.kind === 'HUMAN_REVISED',
      ) ??
      creative.localizations.find(
        (item) => item.locale === 'zh-TW' && item.kind === 'AI_DRAFT',
      );
    if (!source) this.fail('승인할 zh-TW 현지화가 없습니다', 'NO_LOCALIZATION');
    await this.prisma.localizationVersion.create({
      data: {
        creativeId,
        locale: 'zh-TW',
        kind: 'APPROVED',
        text: source.text,
        notes: note ?? source.notes,
        reviewerId: user.id,
      },
    });
    await this.prisma.generatedCreative.update({
      where: { id: creativeId },
      data: { status: 'LOCALIZATION_APPROVED' },
    });
    await this.recordEvent(creativeId, 'LOCALIZATION_APPROVED', user.id, note);
    return this.findById(creativeId);
  }

  approveCreative(user: User, creativeId: string, note?: string) {
    return this.transition(user, creativeId, 'APPROVED', 'APPROVED', note);
  }

  requestRevision(user: User, creativeId: string, reason: string) {
    this.requireReason(reason);
    return this.transition(
      user,
      creativeId,
      'REVISION_REQUESTED',
      'REVISION_REQUESTED',
      reason,
    );
  }

  rejectCreative(user: User, creativeId: string, reason: string) {
    this.requireReason(reason);
    return this.transition(user, creativeId, 'REJECTED', 'REJECTED', reason);
  }

  async updateCreativeText(user: User, creativeId: string, koreanText: string) {
    const creative = await this.load(creativeId);
    if (!koreanText.trim()) this.fail('한국어 원문은 비어 있을 수 없습니다', 'BAD_USER_INPUT');
    if (creative.status !== 'DRAFT' && creative.status !== 'REVISION_REQUESTED') {
      this.fail(`${creative.status} 상태에서는 원문을 수정할 수 없습니다`, 'ILLEGAL_TRANSITION');
    }
    if (creative.status === 'REVISION_REQUESTED') {
      assertTransition(this.context(creative, user), 'DRAFT');
    }
    await this.prisma.generatedCreative.update({
      where: { id: creativeId },
      data: {
        koreanText,
        lastEditedById: user.id,
        status: creative.status === 'REVISION_REQUESTED' ? 'DRAFT' : undefined,
        revision: creative.status === 'REVISION_REQUESTED' ? { increment: 1 } : undefined,
      },
    });
    const jobId = localizeZhTwJobId(creativeId);
    const payload = { creativeId };
    await this.localizationQueue.add(JOB_TYPES.LOCALIZE_ZH_TW, payload, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
    await this.jobRecord.enqueue(jobId, LOCALIZATION_QUEUE, JOB_TYPES.LOCALIZE_ZH_TW, payload);
    return this.findById(creativeId);
  }

  async releaseMinorFlag(user: User, creativeId: string, reason: string) {
    if (user.role !== 'REVIEWER' && user.role !== 'ADMIN') {
      this.fail('미성년자 플래그 해제 권한이 없습니다', 'FORBIDDEN');
    }
    this.requireReason(reason);
    await this.load(creativeId);
    await this.prisma.generatedCreative.update({
      where: { id: creativeId },
      data: { minorFlagged: false, minorFlagNote: reason },
    });
    await this.recordEvent(creativeId, 'MINOR_FLAG_RELEASED', user.id, reason);
    return this.findById(creativeId);
  }

  async findAll(status?: CreativeStatus, search?: string, type?: CreativeType) {
    const trimmed = search?.trim();
    const creatives = await this.prisma.generatedCreative.findMany({
      where: {
        status: status ?? undefined,
        type: type ?? undefined,
        OR: trimmed
          ? [
              { koreanText: { contains: trimmed, mode: 'insensitive' } },
              { brief: { title: { contains: trimmed, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      include: REVIEW_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return creatives.map((creative) => this.mapCreative(creative));
  }

  async findById(id: string) {
    const creative = await this.prisma.generatedCreative.findUnique({
      where: { id },
      include: REVIEW_DETAIL_INCLUDE,
    });
    if (!creative) throw new NotFoundException('생성물을 찾을 수 없습니다');
    return {
      ...this.mapCreative(creative),
      images: await Promise.all(
        creative.images.map(async (image) => ({
          id: image.id,
          url: await this.storage.presignGet(image.storageKey),
          cleanUrl: image.cleanStorageKey
            ? await this.storage.presignGet(image.cleanStorageKey)
            : null,
          overlayHeadline: image.overlayHeadline,
          overlaySubline: image.overlaySubline,
          quality: image.quality,
          instructions: image.instructions,
          prompt: image.prompt,
          sizePreset: image.sizePreset,
          referenceKeys: image.referenceKeys,
          createdAt: image.createdAt,
          costEstimateUsd: image.costEstimateUsd,
        })),
      ),
      videos: await Promise.all(
        creative.videos.map(async (video) => ({
          id: video.id,
          url: await this.storage.presignGet(video.storageKey),
          seconds: video.seconds,
          size: video.size,
          prompt: video.prompt,
          instructions: video.instructions,
          referenceKeys: video.referenceKeys,
          createdAt: video.createdAt,
          costEstimateUsd: video.costEstimateUsd?.toNumber() ?? null,
        })),
      ),
      briefReferenceAds: await this.mapBriefReferenceAds(creative.brief.references),
    };
  }

  private mapBriefReferenceAds(
    references: Array<{
      sourceAd: {
        id: string;
        title: string | null;
        mediaAsset: {
          kind: string;
          storageKey: string;
          thumbnailKey: string | null;
        } | null;
      } | null;
    }>,
  ) {
    const ads = references.flatMap((reference) => {
      const sourceAd = reference.sourceAd;
      const mediaAsset = sourceAd?.mediaAsset;
      if (!sourceAd || !mediaAsset) return [];
      const thumbnailKey =
        mediaAsset.kind === 'IMAGE' ? mediaAsset.storageKey : mediaAsset.thumbnailKey;
      if (!thumbnailKey) return [];
      return [{ sourceAdId: sourceAd.id, title: sourceAd.title, thumbnailKey }];
    });
    return Promise.all(
      ads.map(async (ad) => ({
        sourceAdId: ad.sourceAdId,
        title: ad.title,
        thumbnailUrl: await this.storage.presignGet(ad.thumbnailKey),
      })),
    );
  }

  private async transition(
    user: User,
    creativeId: string,
    to: CreativeStatus,
    event: ReviewEventKind,
    note?: string,
  ) {
    const creative = await this.load(creativeId);
    assertTransition(this.context(creative, user), to);
    await this.prisma.generatedCreative.update({ where: { id: creativeId }, data: { status: to } });
    await this.recordEvent(creativeId, event, user.id, note);
    return this.findById(creativeId);
  }

  private async load(creativeId: string) {
    const creative = await this.prisma.generatedCreative.findUnique({
      where: { id: creativeId },
      include: REVIEW_INCLUDE,
    });
    if (!creative) throw new NotFoundException('생성물을 찾을 수 없습니다');
    return creative;
  }

  private context(creative: Awaited<ReturnType<ReviewService['load']>>, user: User): TransitionContext {
    return {
      creative: {
        status: creative.status,
        createdById: creative.createdById,
        lastEditedById: creative.lastEditedById,
        minorFlagged: creative.minorFlagged,
        locale: creative.brief.locale,
      },
      actor: { id: user.id, role: user.role },
    };
  }

  private recordEvent(
    creativeId: string,
    kind: ReviewEventKind,
    actorId: string,
    note?: string,
  ) {
    return this.prisma.reviewRequest.create({
      data: { creativeId, kind, actorId, note },
    });
  }

  private mapCreative<T extends {
    brief: { title: string; locale: string };
    scenes: unknown;
    policyChecks: Array<{ detail: unknown }>;
  }>(creative: T) {
    return {
      ...creative,
      briefTitle: creative.brief.title,
      locale: creative.brief.locale,
      images: [],
      videos: [],
      scenesJson: creative.scenes ? JSON.stringify(creative.scenes) : null,
      policyChecks: creative.policyChecks.map((check) => ({
        ...check,
        detailJson: JSON.stringify(check.detail),
      })),
    };
  }

  private requireReason(reason: string) {
    if (!reason.trim()) this.fail('사유는 필수입니다', 'BAD_USER_INPUT');
  }

  private fail(message: string, code: string): never {
    throw new GraphQLError(message, { extensions: { code } });
  }
}

import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';

export const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: false,
} as const;

@Injectable()
export class JobRecordService {
  constructor(private readonly prisma: PrismaService) {}

  /** 큐 등록 시점에 호출. 같은 id로 재등록되면 기존 행 유지 (idempotent). */
  enqueue(id: string, queue: string, type: string, payload: Prisma.InputJsonValue) {
    return this.prisma.job.upsert({
      where: { id },
      update: {},
      create: { id, queue, type, payload, status: 'QUEUED' },
    });
  }

  markRunning(id: string) {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
    });
  }

  markSucceeded(id: string, result?: Prisma.InputJsonValue) {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'SUCCEEDED', finishedAt: new Date(), result: result ?? Prisma.JsonNull },
    });
  }

  markFailed(id: string, error: string) {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'FAILED', finishedAt: new Date(), error },
    });
  }

  /** 실패한 잡의 수동 재시도 — BullMQ retry()와 짝으로 호출된다 */
  requeue(id: string) {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'QUEUED', error: null, finishedAt: null },
    });
  }

  findById(id: string) {
    return this.prisma.job.findUnique({ where: { id } });
  }

  /**
   * 등록 또는 재시도 — removeOnFail 잡이 Redis에 남아 같은 jobId의 add를 무시하므로
   * 실패 상태면 retry()로 되살린다 (실측: STT 실패 자산 재처리가 조용히 무시되던 문제).
   * 대기·실행 중이면 그대로 둔다 (중복 등록 방지).
   */
  async enqueueOrRetry(
    queue: Queue,
    queueName: string,
    jobName: string,
    jobId: string,
    payload: Prisma.InputJsonValue,
    opts?: { attempts?: number },
  ) {
    const existing = await queue.getJob(jobId);
    if (existing && (await existing.getState()) === 'failed') {
      await existing.retry();
      return this.requeue(jobId);
    }
    // 워커가 add 직후 ms 단위로 잡을 집어가므로 DB 행을 먼저 만들어야 markRunning이 레코드를 찾는다
    // (실측: attempts 1 잡이 9ms 만에 'No record was found for an update'로 죽음 — attempts 3의 백오프 재시도가 가리던 레이스)
    const record = await this.enqueue(jobId, queueName, jobName, payload);
    if (!existing) {
      await queue.add(jobName, payload, { jobId, ...DEFAULT_JOB_OPTS, ...opts });
    }
    return record;
  }
}

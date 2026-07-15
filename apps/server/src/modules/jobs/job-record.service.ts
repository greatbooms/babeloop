import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';

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

  findById(id: string) {
    return this.prisma.job.findUnique({ where: { id } });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AiExecutionMeta {
  provider: string;
  model: string;
  promptTemplate?: string;
  promptVersion?: string;
  inputRef?: string;
  inputTokens?: number;
  outputTokens?: number;
  costEstimateUsd?: number;
}

@Injectable()
export class AiExecutionLogService {
  constructor(private readonly prisma: PrismaService) {}

  /** AI 호출을 감싸 성공·실패를 모두 기록한다. 실패는 기록 후 다시 던진다. */
  async record<T>(meta: AiExecutionMeta, fn: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await fn();
      await this.write(meta, {
        status: 'SUCCESS',
        output: result as Prisma.InputJsonValue,
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await this.write(meta, {
        status: 'FAILURE',
        errorMessage: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  private async write(
    meta: AiExecutionMeta,
    outcome: {
      status: 'SUCCESS' | 'FAILURE';
      output?: Prisma.InputJsonValue;
      errorMessage?: string;
      latencyMs: number;
    },
  ): Promise<void> {
    try {
      await this.prisma.aiExecutionLog.create({ data: { ...meta, ...outcome } });
    } catch (logError) {
      // 로그 기록 실패가 원래 작업을 죽여서는 안 된다
      console.error('ai_execution_logs 기록 실패:', logError);
    }
  }
}

import { Global, Module } from '@nestjs/common';
import { AiExecutionLogService } from './ai-execution-log.service';

@Global()
@Module({ providers: [AiExecutionLogService], exports: [AiExecutionLogService] })
export class AiLogModule {}

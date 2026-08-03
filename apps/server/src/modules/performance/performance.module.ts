import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PERFORMANCE_SYNC_QUEUE } from '../../queues/queue.constants';
import { AuthModule } from '../auth/auth.module';
import { PerformanceResolver } from './performance.resolver';
import { PerformanceService } from './performance.service';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: PERFORMANCE_SYNC_QUEUE })],
  providers: [PerformanceService, PerformanceResolver],
  exports: [PerformanceService],
})
export class PerformanceModule {}

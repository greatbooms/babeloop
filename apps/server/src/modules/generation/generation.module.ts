import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CREATIVE_GENERATION_QUEUE } from '../../queues/queue.constants';
import { AuthModule } from '../auth/auth.module';
import { PerformanceModule } from '../performance/performance.module';
import { BriefResolver } from './brief.resolver';
import { BriefService } from './brief.service';

@Module({
  imports: [
    AuthModule,
    PerformanceModule,
    BullModule.registerQueue({ name: CREATIVE_GENERATION_QUEUE }),
  ],
  providers: [BriefService, BriefResolver],
  exports: [BriefService],
})
export class GenerationModule {}

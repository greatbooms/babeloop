import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LOCALIZATION_QUEUE, POLICY_CHECK_QUEUE } from '../../queues/queue.constants';
import { AuthModule } from '../auth/auth.module';
import { ReviewResolver } from './review.resolver';
import { ReviewService } from './review.service';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: POLICY_CHECK_QUEUE }, { name: LOCALIZATION_QUEUE }),
  ],
  providers: [ReviewService, ReviewResolver],
  exports: [ReviewService],
})
export class ReviewModule {}

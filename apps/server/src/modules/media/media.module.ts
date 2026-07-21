import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CREATIVE_ANALYSIS_QUEUE, MEDIA_PROCESSING_QUEUE } from '../../queues/queue.constants';
import { MediaResolver } from './media.resolver';
import { MediaService } from './media.service';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: MEDIA_PROCESSING_QUEUE }, { name: CREATIVE_ANALYSIS_QUEUE })],
  providers: [MediaService, MediaResolver],
})
export class MediaModule {}

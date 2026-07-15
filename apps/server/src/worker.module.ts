import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { AiLogModule } from './modules/ai-log/ai-log.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { OcrModule } from './providers/ocr/ocr.module';
import { SttModule } from './providers/stt/stt.module';
import { MediaProcessingProcessor } from './queues/media-processing.processor';
import { MEDIA_PROCESSING_QUEUE, redisConnectionFromUrl } from './queues/queue.constants';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    BullModule.forRootAsync({
      useFactory: () => ({ connection: redisConnectionFromUrl(process.env.REDIS_URL!) }),
    }),
    BullModule.registerQueue({ name: MEDIA_PROCESSING_QUEUE }),
    PrismaModule,
    StorageModule,
    AiLogModule,
    JobsModule,
    OcrModule,
    SttModule,
  ],
  providers: [MediaProcessingProcessor],
})
export class WorkerModule {}

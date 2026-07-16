import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { AiLogModule } from './modules/ai-log/ai-log.module';
import { CreativeAnalysisModule } from './modules/creative-analysis/creative-analysis.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { EmbeddingModule } from './providers/embedding/embedding.module';
import { OcrModule } from './providers/ocr/ocr.module';
import { SttModule } from './providers/stt/stt.module';
import { TextModule } from './providers/text/text.module';
import { MediaProcessingProcessor } from './queues/media-processing.processor';
import { CreativeAnalysisProcessor } from './queues/creative-analysis.processor';
import { EmbeddingProcessor } from './queues/embedding.processor';
import {
  CREATIVE_ANALYSIS_QUEUE,
  EMBEDDING_QUEUE,
  MEDIA_PROCESSING_QUEUE,
  redisConnectionFromUrl,
} from './queues/queue.constants';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    BullModule.forRootAsync({
      useFactory: () => ({ connection: redisConnectionFromUrl(process.env.REDIS_URL!) }),
    }),
    BullModule.registerQueue(
      { name: MEDIA_PROCESSING_QUEUE },
      { name: CREATIVE_ANALYSIS_QUEUE },
      { name: EMBEDDING_QUEUE },
    ),
    PrismaModule,
    StorageModule,
    EmbeddingModule,
    AiLogModule,
    CreativeAnalysisModule,
    JobsModule,
    OcrModule,
    SttModule,
    TextModule,
  ],
  providers: [CreativeAnalysisProcessor, EmbeddingProcessor, MediaProcessingProcessor],
})
export class WorkerModule {}

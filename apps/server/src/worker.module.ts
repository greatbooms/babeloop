import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './common/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { AiLogModule } from './modules/ai-log/ai-log.module';
import { CreativeAnalysisModule } from './modules/creative-analysis/creative-analysis.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { PolicyModule } from './modules/policy/policy.module';
import { EmbeddingModule } from './providers/embedding/embedding.module';
import { ImageModule } from './providers/image/image.module';
import { OcrModule } from './providers/ocr/ocr.module';
import { PerfSourceModule } from './providers/perf-source/perf-source.module';
import { SttModule } from './providers/stt/stt.module';
import { TextModule } from './providers/text/text.module';
import { VideoModule } from './providers/video/video.module';
import { CreativeGenerationProcessor } from './queues/creative-generation.processor';
import { MediaProcessingProcessor } from './queues/media-processing.processor';
import { LocalizationProcessor } from './queues/localization.processor';
import { CreativeAnalysisProcessor } from './queues/creative-analysis.processor';
import { EmbeddingProcessor } from './queues/embedding.processor';
import { PolicyCheckProcessor } from './queues/policy-check.processor';
import { PerformanceSyncProcessor } from './queues/performance-sync.processor';
import { PerformanceSyncScheduler } from './queues/performance-sync.scheduler';
import {
  CREATIVE_ANALYSIS_QUEUE,
  CREATIVE_GENERATION_QUEUE,
  EMBEDDING_QUEUE,
  LOCALIZATION_QUEUE,
  MEDIA_PROCESSING_QUEUE,
  POLICY_CHECK_QUEUE,
  PERFORMANCE_SYNC_QUEUE,
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
      { name: CREATIVE_GENERATION_QUEUE },
      { name: LOCALIZATION_QUEUE },
      { name: POLICY_CHECK_QUEUE },
      { name: PERFORMANCE_SYNC_QUEUE },
    ),
    PrismaModule,
    StorageModule,
    EmbeddingModule,
    ImageModule,
    AiLogModule,
    CreativeAnalysisModule,
    JobsModule,
    PolicyModule,
    PerformanceModule,
    OcrModule,
    PerfSourceModule,
    SttModule,
    TextModule,
    VideoModule,
  ],
  providers: [
    CreativeAnalysisProcessor,
    CreativeGenerationProcessor,
    EmbeddingProcessor,
    LocalizationProcessor,
    MediaProcessingProcessor,
    PolicyCheckProcessor,
    PerformanceSyncProcessor,
    PerformanceSyncScheduler,
  ],
})
export class WorkerModule {}

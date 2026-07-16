import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';
import { validateEnv } from './common/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { HealthController } from './health/health.controller';
import { AiLogModule } from './modules/ai-log/ai-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrandModule } from './modules/brand/brand.module';
import { CompetitorModule } from './modules/competitor/competitor.module';
import { CreativeAnalysisModule } from './modules/creative-analysis/creative-analysis.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { MarketModule } from './modules/market/market.module';
import { MediaModule } from './modules/media/media.module';
import { SourceAdModule } from './modules/source-ad/source-ad.module';
import { EmbeddingModule } from './providers/embedding/embedding.module';
import { OcrModule } from './providers/ocr/ocr.module';
import { SttModule } from './providers/stt/stt.module';
import { TextModule } from './providers/text/text.module';
import { redisConnectionFromUrl } from './queues/queue.constants';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    BullModule.forRootAsync({
      useFactory: () => ({ connection: redisConnectionFromUrl(process.env.REDIS_URL!) }),
    }),
    ...(existsSync(join(__dirname, '..', 'public'))
      ? [
          ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
            exclude: ['/graphql', '/health', '/ready'],
          }),
        ]
      : []),
    PrismaModule,
    StorageModule,
    EmbeddingModule,
    OcrModule,
    SttModule,
    TextModule,
    AiLogModule,
    AuthModule,
    BrandModule,
    CompetitorModule,
    CreativeAnalysisModule,
    JobsModule,
    MarketModule,
    MediaModule,
    SourceAdModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(__dirname, '..', 'src', 'generated', 'schema.gql'),
      sortSchema: true,
      // Apollo Server 5는 비프로덕션에서 기본으로 Sandbox 랜딩 페이지를 제공한다
      context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}

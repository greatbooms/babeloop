import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';
import { validateEnv } from './common/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AiLogModule } from './modules/ai-log/ai-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrandModule } from './modules/brand/brand.module';
import { MarketModule } from './modules/market/market.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ...(existsSync(join(__dirname, '..', 'public'))
      ? [
          ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
            exclude: ['/graphql', '/health', '/ready'],
          }),
        ]
      : []),
    PrismaModule,
    AiLogModule,
    AuthModule,
    BrandModule,
    MarketModule,
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

import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { mkdirSync, writeFileSync } from 'fs';
import { lexicographicSortSchema, printSchema } from 'graphql';
import { join } from 'path';
import { AuthResolver } from './modules/auth/auth.resolver';
import { BrandResolver } from './modules/brand/brand.resolver';
import { MarketResolver } from './modules/market/market.resolver';

// DB·Redis 없이 스키마 SDL만 생성한다. web codegen이 이 파일을 읽으므로
// 새 Resolver를 추가하면 아래 목록에도 추가해야 한다.
async function main() {
  const app = await NestFactory.create(GraphQLSchemaBuilderModule, { logger: false });
  await app.init();
  const factory = app.get(GraphQLSchemaFactory);
  const schema = await factory.create([AuthResolver, BrandResolver, MarketResolver]);
  const outDir = join(__dirname, '..', 'src', 'generated');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'schema.gql'), printSchema(lexicographicSortSchema(schema)));
  console.log(`schema written: ${join(outDir, 'schema.gql')}`);
  await app.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

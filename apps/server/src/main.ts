import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';
import { applySessionMiddleware } from './common/session/session.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // CSV 임포트(base64)가 GraphQL 본문으로 들어온다 — 기본 100KB로는 ST CSV(~500KB)가 거부됨
  app.use(json({ limit: '25mb' }));
  applySessionMiddleware(app);
  const port = Number(process.env.PORT ?? 16000);
  await app.listen(port);
  console.log(`API listening on :${port}`);
}
bootstrap();

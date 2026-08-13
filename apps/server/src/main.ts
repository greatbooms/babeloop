import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { json, static as serveStatic } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { applySessionMiddleware } from './common/session/session.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // CSV 임포트(base64)가 GraphQL 본문으로 들어온다 — 기본 100KB로는 ST CSV(~500KB)가 거부됨
  app.use(json({ limit: '25mb' }));
  app.use(
    '/fonts',
    serveStatic(join(process.cwd(), 'apps/server/assets/fonts'), {
      immutable: true,
      maxAge: '1d',
    }),
  );
  // 터널/리버스프록시 뒤에서도 secure 세션 쿠키가 발급되도록 X-Forwarded-Proto를 항상 신뢰한다
  // (프록시가 없으면 해당 헤더도 없으므로 로컬 동작에 영향 없음)
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  // 프론트 분리 배포(버셀 등): WEB_ORIGINS에 허용 오리진(콤마 구분)을 넣으면
  // CORS + 크로스 사이트 쿠키 모드가 켜진다. 미설정 시 같은 도메인 서빙(현행) 그대로.
  const webOrigins = (process.env.WEB_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  if (webOrigins.length > 0) {
    app.enableCors({ origin: webOrigins, credentials: true });
  }
  applySessionMiddleware(app);
  const port = Number(process.env.PORT ?? 16000);
  await app.listen(port);
  console.log(`API listening on :${port}`);
}
bootstrap();

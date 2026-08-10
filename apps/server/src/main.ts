import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';
import { applySessionMiddleware } from './common/session/session.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // CSV 임포트(base64)가 GraphQL 본문으로 들어온다 — 기본 100KB로는 ST CSV(~500KB)가 거부됨
  app.use(json({ limit: '25mb' }));
  // 프론트 분리 배포(버셀 등): WEB_ORIGINS에 허용 오리진(콤마 구분)을 넣으면
  // CORS + 크로스 사이트 쿠키 모드가 켜진다. 미설정 시 같은 도메인 서빙(현행) 그대로.
  const webOrigins = (process.env.WEB_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  if (webOrigins.length > 0) {
    app.enableCors({ origin: webOrigins, credentials: true });
    // 터널/프록시 뒤에서 secure 쿠키를 위해 X-Forwarded-Proto를 신뢰한다
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  applySessionMiddleware(app);
  const port = Number(process.env.PORT ?? 16000);
  await app.listen(port);
  console.log(`API listening on :${port}`);
}
bootstrap();

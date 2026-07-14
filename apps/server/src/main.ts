import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { applySessionMiddleware } from './common/session/session.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  applySessionMiddleware(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API listening on :${port}`);
}
bootstrap();

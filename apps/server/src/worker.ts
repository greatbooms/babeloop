import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'http';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const ctx = await NestFactory.createApplicationContext(WorkerModule);
  await ctx.init();

  const port = Number(process.env.WORKER_PORT ?? 16001);
  createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end('{"status":"ok","role":"worker"}');
  }).listen(port);
  console.log(`worker ready — media-processing 소비 중, health :${port}`);
}
bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});

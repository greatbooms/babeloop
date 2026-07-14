import 'dotenv/config';
import Redis from 'ioredis';

async function bootstrap() {
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.ping();
  console.log('worker ready (큐 프로세서는 슬라이스 1에서 등록)');
}
bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});

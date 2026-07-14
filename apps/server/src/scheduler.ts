import 'dotenv/config';
import Redis from 'ioredis';

async function bootstrap() {
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.ping();
  console.log('scheduler ready (반복 작업은 슬라이스 1에서 등록)');
}
bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});

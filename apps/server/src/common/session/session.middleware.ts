import { INestApplication } from '@nestjs/common';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import Redis from 'ioredis';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

/** Redis 연결을 닫는 cleanup 함수를 반환한다 — 테스트 teardown에서 호출하지 않으면 jest가 종료되지 않는다. */
export function applySessionMiddleware(app: INestApplication): () => Promise<void> {
  const redisClient = new Redis(process.env.REDIS_URL!);
  app.use(
    session({
      store: new RedisStore({ client: redisClient }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7일
      },
    }),
  );
  return async () => {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    }
  };
}

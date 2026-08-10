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
  // 프론트 분리 배포(WEB_ORIGINS 설정)에서는 쿠키가 크로스 사이트로 전송돼야 한다
  // → SameSite=None + Secure(HTTPS 필수). 같은 도메인 배포는 기존 lax 유지.
  const crossSite = Boolean((process.env.WEB_ORIGINS ?? '').trim());
  app.use(
    session({
      store: new RedisStore({ client: redisClient }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: crossSite ? 'none' : 'lax',
        secure: crossSite || process.env.NODE_ENV === 'production',
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

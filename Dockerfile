# kis-trader-back의 나스 배포 패턴을 따른다: 멀티스테이지 빌드로 웹을 서버에 내장한 단일 이미지.
# main(API+화면)과 worker(잡 처리)는 같은 이미지에서 command만 달리해 두 컨테이너로 띄운다.
#
# alpine이 아닌 bookworm-slim을 쓰는 이유: ffmpeg-static·argon2가 glibc 바이너리라 musl에서 깨진다.
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
WORKDIR /app

FROM base AS builder
# 매니페스트만 먼저 복사해 의존성 설치 레이어를 캐시한다
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
# prisma client 생성 → 루트 build(서버 nest build + 웹 vite build + public 복사)
RUN pnpm prisma:generate && pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 16000
# 기동 시 마이그레이션을 먼저 적용한다 (worker 컨테이너는 compose에서 command 교체)
CMD ["sh", "-c", "npx prisma migrate deploy && node apps/server/dist/main.js"]

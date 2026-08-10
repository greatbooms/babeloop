# BabeLoop 나스 배포 가이드

kis-trader-back과 같은 패턴: 웹이 내장된 단일 이미지를 빌드해 나스에서 compose로 실행한다.
main(API+화면)·worker(잡)·Postgres(pgvector)·Redis·MinIO 5개 컨테이너.

## 1. 이미지 빌드 (개발 머신에서)

```bash
# 나스 CPU에 맞춰 --platform 지정 (시놀로지 인텔 모델 = linux/amd64)
docker build --platform linux/amd64 -t babeloop:latest .
docker save babeloop:latest | gzip > babeloop-image.tar.gz
# 레지스트리를 쓰는 경우(ghcr 등)는 tag & push로 대체
```

## 2. 나스 준비

```bash
mkdir -p /volume1/docker/babeloop/secrets && cd /volume1/docker/babeloop
# 이 폴더로 복사: compose.yml, .env(.env.example 채워서), secrets/snowflake_babeloop_rsa.p8
docker load < babeloop-image.tar.gz
docker compose up -d       # 마이그레이션은 app 기동 시 자동 적용
```

## 3. 최초 1회 — 시드 계정 생성

`.env`의 ADMIN_*/REVIEWER_* 값으로 계정을 만든다:

```bash
docker compose exec app npx tsx prisma/seed.ts
```

## 4. 공개 접속 — Cloudflare Tunnel (도메인: eric-nas.com)

compose에 cloudflared가 포함돼 있다. 최초 1회 대시보드 설정:

1. [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Networks → Tunnels → Create a tunnel**
   → Cloudflared 선택 → 이름 `eric-nas` → 생성
2. 커넥터 설치 화면에서 Docker를 선택하면 명령어 안에 긴 토큰(`eyJ…`)이 보인다
   → 그 토큰을 나스 `.env`의 `TUNNEL_TOKEN=`에 붙여넣는다 (명령 자체는 실행하지 않아도 됨)
3. 터널 상세의 **Public Hostname** 탭에서 두 개 추가:

| Subdomain | Domain | Service |
|---|---|---|
| `babeloop` | eric-nas.com | `HTTP://app:16000` |
| `files` | eric-nas.com | `HTTP://minio:9000` |

`docker compose up -d` 하면 cloudflared가 토큰으로 접속해 라우팅이 살아난다.
(프론트를 버셀로 분리하는 경우 `WEB_ORIGINS`에 버셀 도메인을 넣는다 — 화면을 나스에서
같이 서빙하는 경우 babeloop.eric-nas.com 하나로 충분하고 WEB_ORIGINS는 비워둔다)

## 5. 업데이트 배포

새 이미지 빌드 → 나스로 전송/load → `docker compose up -d` (볼륨의 데이터는 유지된다).

## 주의

- `.env`의 시크릿(POSTGRES_PASSWORD, MINIO_PASSWORD, SESSION_SECRET, ADMIN_PASSWORD)은
  전부 새로 생성한다 — dev 기본값(changeme-*, babeloop-secret) 금지.
- Snowflake 개인키(`secrets/snowflake_babeloop_rsa.p8`)는 git에 없다 — 개발 머신의
  `BabeLoop/secrets/`에서 직접 복사한다.
- e2e/dev 스크립트는 나스에서 돌리지 않는다 (mock 강제 장치는 dev 전용).

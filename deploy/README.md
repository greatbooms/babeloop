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

## 4. 공개 접속 (Cloudflare Tunnel 권장)

나스에 cloudflared 컨테이너를 하나 추가하고 두 호스트를 라우팅한다:

| 호스트 | 대상 | 용도 |
|---|---|---|
| `babeloop.도메인` | `http://app:16000` | 화면 + API |
| `files.도메인` | `http://minio:9000` | 이미지·영상 presign 링크 |

라우팅 후 `.env`의 APP_BASE_URL / OBJECT_STORAGE_PUBLIC_ENDPOINT를 해당 주소로 맞추고
`docker compose up -d` 로 재적용한다.

## 5. 업데이트 배포

새 이미지 빌드 → 나스로 전송/load → `docker compose up -d` (볼륨의 데이터는 유지된다).

## 주의

- `.env`의 시크릿(POSTGRES_PASSWORD, MINIO_PASSWORD, SESSION_SECRET, ADMIN_PASSWORD)은
  전부 새로 생성한다 — dev 기본값(changeme-*, babeloop-secret) 금지.
- Snowflake 개인키(`secrets/snowflake_babeloop_rsa.p8`)는 git에 없다 — 개발 머신의
  `BabeLoop/secrets/`에서 직접 복사한다.
- e2e/dev 스크립트는 나스에서 돌리지 않는다 (mock 강제 장치는 dev 전용).

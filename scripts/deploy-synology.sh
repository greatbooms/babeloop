#!/usr/bin/env sh
# BabeLoop 나스 배포 스크립트 — kis-trader-back의 deploy-synology.sh 패턴.
# GitHub Actions가 compose.yml과 함께 업로드해 나스에서 실행한다.
set -eu

APP_NAME="${APP_NAME:-babeloop-app}"
DEPLOY_PATH="${DEPLOY_PATH:?DEPLOY_PATH is required}"
IMAGE="${IMAGE:?IMAGE is required}"
DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"
# 런타임 시크릿은 나스에 상주하는 .env (최초 1회 수동 배치 — deploy/.env.example 참조)
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-.env.prod}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-.deploy.env}"
USE_SUDO_DOCKER="${USE_SUDO_DOCKER:-true}"

docker_cmd() {
  if [ "$USE_SUDO_DOCKER" = "true" ]; then
    sudo -n "$DOCKER_BIN" "$@"
  else
    "$DOCKER_BIN" "$@"
  fi
}

cd "$DEPLOY_PATH"

if [ ! -f "$RUNTIME_ENV_FILE" ]; then
  echo "[error] Missing runtime env file: ${DEPLOY_PATH}/${RUNTIME_ENV_FILE} (로컬 .env.prod 채워서 복사)"
  exit 1
fi

printf 'IMAGE=%s\n' "$IMAGE" > "$DEPLOY_ENV_FILE"
chmod 600 "$DEPLOY_ENV_FILE"

# 컨테이너 env는 compose.yml의 env_file(.env.prod)이 처리 — 여기서는 IMAGE 치환용 파일만 넘긴다
compose() {
  docker_cmd compose --env-file "$DEPLOY_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "[info] Pulling ${IMAGE}"
compose pull app worker cloudflared

echo "[info] Starting babeloop stack"
compose up -d --remove-orphans

echo "[info] Waiting for ${APP_NAME} health"
i=1
while [ "$i" -le 90 ]; do
  status="$(docker_cmd inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$APP_NAME" 2>/dev/null || true)"
  if [ "$status" = "healthy" ]; then
    echo "[info] ${APP_NAME} is healthy"
    # 배포 누적으로 쌓인 옛 babeloop 이미지 정리 (kis 패턴 — 현재 사용 중인 것만 남긴다)
    echo "[info] Pruning dangling images"
    docker_cmd image prune -f >/dev/null 2>&1 || true
    repository="${IMAGE%%@*}"; repository="${repository%:*}"
    current_id="$(docker_cmd image inspect -f '{{.Id}}' "$IMAGE" 2>/dev/null || true)"
    docker_cmd images "$repository" --format '{{.ID}}' | while IFS= read -r image_id; do
      [ -z "$image_id" ] && continue
      full_id="$(docker_cmd image inspect -f '{{.Id}}' "$image_id" 2>/dev/null || true)"
      [ "$full_id" = "$current_id" ] && continue
      docker_cmd rmi "$image_id" >/dev/null 2>&1 && echo "[info] Removed old image ${image_id}" || true
    done
    exit 0
  fi
  echo "[info] ${APP_NAME} status=${status:-unknown}; waiting (${i}/90)"
  i=$((i + 1))
  sleep 2
done

echo "[error] ${APP_NAME} did not become healthy"
docker_cmd ps --filter "name=babeloop"
docker_cmd logs --tail 120 "$APP_NAME" || true
exit 1

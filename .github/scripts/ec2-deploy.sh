#!/usr/bin/env bash
set -Eeuxo pipefail

APP_DIR="${RAMIO_APP_DIR:-/home/ubuntu/Ramio}"
export DEBIAN_FRONTEND=noninteractive
STATUS_FILE="$APP_DIR/.deploy-status"

on_err() {
  local exit_code=$?
  echo "FAILED at line ${BASH_LINENO[0]} while running: ${BASH_COMMAND}" >&2
  echo FAILED > "$STATUS_FILE" 2>/dev/null || true
  exit "$exit_code"
}
trap on_err ERR

sudo apt-get update -y
sudo apt-get install -y nginx docker.io docker-compose-v2
sudo systemctl enable docker nginx || true
sudo systemctl start docker
sudo docker info

sudo -u ubuntu bash -lc "cd \"$APP_DIR\" && COMPOSE_PARALLEL_LIMIT=1 docker compose build backend1 frontend1 > /tmp/ramio-compose-build.log 2>&1; ec=\$?; tail -200 /tmp/ramio-compose-build.log; exit \$ec"

sudo -u ubuntu bash -lc "cd \"$APP_DIR\" && COMPOSE_PARALLEL_LIMIT=1 docker compose up -d --no-build --pull never --remove-orphans > /tmp/ramio-compose-up.log 2>&1; ec=\$?; tail -200 /tmp/ramio-compose-up.log; exit \$ec"

sudo install -m 644 "$APP_DIR/nginx/default.conf" /etc/nginx/sites-available/default
sudo ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

sudo -u ubuntu bash -lc "cd \"$APP_DIR\" && docker compose ps"

echo SUCCESS > "$STATUS_FILE"

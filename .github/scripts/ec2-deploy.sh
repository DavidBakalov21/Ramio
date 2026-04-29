#!/usr/bin/env bash
set -euxo pipefail

APP_DIR="${RAMIO_APP_DIR:-/home/ubuntu/Ramio}"
export DEBIAN_FRONTEND=noninteractive
STATUS_FILE="$APP_DIR/.deploy-status"

trap 'echo FAILED > "$STATUS_FILE" 2>/dev/null || true; exit 1' ERR

sudo apt-get update -y
sudo apt-get install -y nginx docker.io docker-compose-v2
sudo systemctl enable docker nginx || true
sudo systemctl start docker
sudo docker info

sudo -u ubuntu bash -lc "cd \"$APP_DIR\" && docker compose pull > /tmp/ramio-compose-pull.log 2>&1 || true; tail -40 /tmp/ramio-compose-pull.log || true"

sudo -u ubuntu bash -lc "cd \"$APP_DIR\" && docker compose up -d --build --remove-orphans > /tmp/ramio-compose-up.log 2>&1; ec=\$?; tail -200 /tmp/ramio-compose-up.log; exit \$ec"

sudo install -m 644 "$APP_DIR/nginx/default.conf" /etc/nginx/sites-available/default
sudo ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

sudo -u ubuntu bash -lc "cd \"$APP_DIR\" && docker compose ps"

echo SUCCESS > "$STATUS_FILE"

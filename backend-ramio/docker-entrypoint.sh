#!/bin/sh
set -e
WORKDIR="${TMPDIR:-/opt/ramio-runner-work}"
RUNTIME_HOME="$WORKDIR/.app-home"
mkdir -p "$RUNTIME_HOME/.docker"
mkdir -p "$WORKDIR"
chown -R 1000:1000 "$WORKDIR"

export HOME="$RUNTIME_HOME"
export DOCKER_CONFIG="$RUNTIME_HOME/.docker"

DOCKER_GID="${DOCKER_GID:-}"
if [ -S /var/run/docker.sock ]; then
  SOCK_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null) && DOCKER_GID="$SOCK_GID"
fi
DOCKER_GID="${DOCKER_GID:-988}"

exec setpriv --reuid=1000 --regid=1000 --groups "$DOCKER_GID" --inh-caps=-all -- "$@"

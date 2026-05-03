#!/bin/sh
set -e
WORKDIR="${TMPDIR:-/opt/ramio-runner-work}"
RUNTIME_HOME="$WORKDIR/.app-home"
mkdir -p "$RUNTIME_HOME/.docker"
mkdir -p "$WORKDIR"
chown -R 1000:1000 "$WORKDIR"

# Docker CLI uses $HOME/.docker (or $DOCKER_CONFIG); default HOME=/root breaks after we drop to uid 1000.
export HOME="$RUNTIME_HOME"
export DOCKER_CONFIG="$RUNTIME_HOME/.docker"

# Supplementary GID must match the *mounted* socket's group (often 999 on Ubuntu, not 988).
DOCKER_GID="${DOCKER_GID:-}"
if [ -S /var/run/docker.sock ]; then
  SOCK_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null) && DOCKER_GID="$SOCK_GID"
fi
DOCKER_GID="${DOCKER_GID:-988}"

# Drop from image default (root) to app UID with docker socket group (DooD).
exec setpriv --reuid=1000 --regid=1000 --groups "$DOCKER_GID" --inh-caps=-all -- "$@"

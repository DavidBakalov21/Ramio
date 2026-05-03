#!/bin/sh
set -e
WORKDIR="${TMPDIR:-/opt/ramio-runner-work}"
mkdir -p "$WORKDIR"
chown -R 1000:1000 "$WORKDIR"

DOCKER_GID="${DOCKER_GID:-988}"
# Drop from image default (root) to app UID; supplementary GIDs must match host
# `docker` group so /var/run/docker.sock is usable (DooD). Use --groups (portable);
# --supp-group is not available on Debian bookworm / Ubuntu setpriv.
exec setpriv --reuid=1000 --regid=1000 --clear-groups --groups "$DOCKER_GID" --inh-caps=-all -- "$@"

#!/bin/sh
set -e
WORKDIR="${TMPDIR:-/opt/ramio-runner-work}"
mkdir -p "$WORKDIR"
chown -R 1000:1000 "$WORKDIR"

DOCKER_GID="${DOCKER_GID:-988}"
# Drop from image default (root) to app UID; supplementary GID must match host
# `docker` group so /var/run/docker.sock is usable (DooD).
exec setpriv --reuid=1000 --regid=1000 --clear-groups --supp-group "$DOCKER_GID" --inh-caps=-all -- "$@"

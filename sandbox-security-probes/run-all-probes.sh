#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="${SCRIPT_DIR}/.work"
IMAGE="${RUNNER_PYTHON_IMAGE:-runner-python:3.12}"
TIMEOUT_SEC="${RUNNER_TIMEOUT_SEC:-35}"
DOCKER_TIMEOUT_MS="${RUNNER_TIMEOUT_MS:-30000}"

mkdir -p "$WORK"
rm -f "$WORK"/*.py
cp "${SCRIPT_DIR}/python/"*.py "$WORK/"

run_probe() {
  local name="$1"
  local file="$2"
  echo ""
  echo "========== $name =========="
  timeout "$TIMEOUT_SEC" docker run --rm -i \
    --network none \
    --cpus=0.5 \
    --memory=256m \
    --memory-swap=256m \
    --pids-limit=128 \
    --read-only \
    --tmpfs /tmp:rw,size=64m \
    --security-opt no-new-privileges \
    --cap-drop ALL \
    -v "${WORK}:/workspace:ro" \
    -w /workspace \
    "$IMAGE" \
    python -B "/workspace/${file}" \
    || true
  echo "(exit code: $? — expect non-zero or timeout for a blocked attack)"
}

echo "Image: $IMAGE"
echo "Container wall-clock limit (host timeout): ${TIMEOUT_SEC}s (backend uses ${DOCKER_TIMEOUT_MS}ms)"

run_probe "Network egress" probe_network.py
run_probe "Fork storm (PID cap)" probe_fork.py
run_probe "Memory exhaustion" probe_memory.py
run_probe "Filesystem escape / tamper" probe_filesystem.py
run_probe "CPU busy-loop (needs ~30s kill)" probe_cpu.py
run_probe "Long sleep (timeout)" probe_sleep.py
run_probe "Privileges / caps" probe_privileges.py

echo ""
echo "Done. Review output: BLOCKED / timeout = pass; ALLOWED = fail."

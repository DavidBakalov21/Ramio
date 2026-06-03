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

run_probe "Network egress" probe_network.py
run_probe "Fork storm (PID cap)" probe_fork.py
run_probe "Memory exhaustion" probe_memory.py
run_probe "Filesystem escape / tamper" probe_filesystem.py
run_probe "Privileges / caps" probe_privileges.py

echo ""
echo "Done. Review output: BLOCKED / timeout = pass; ALLOWED = fail."




"""
Image: runner-python:3.12
Container wall-clock limit (host timeout): 35s (backend uses 30000ms)

========== Network egress ==========
BLOCKED 1.1.1.1:53: OSError(101, 'Network is unreachable')
BLOCKED 8.8.8.8:53: OSError(101, 'Network is unreachable')
BLOCKED github.com:443: gaierror(-3, 'Temporary failure in name resolution')
OK: all connection attempts failed
(exit code: 0 — expect non-zero or timeout for a blocked attack)

========== Fork storm (PID cap) ==========
forked 20 children...
forked 40 children...
forked 60 children...
forked 80 children...
forked 100 children...
forked 120 children...
BLOCKED after 127 forks: BlockingIOError(11, 'Resource temporarily unavailable')
(exit code: 0 — expect non-zero or timeout for a blocked attack)

========== Memory exhaustion ==========
allocated ~16 MiB
allocated ~32 MiB
allocated ~48 MiB
allocated ~64 MiB
allocated ~80 MiB
allocated ~96 MiB
allocated ~112 MiB
allocated ~128 MiB
allocated ~144 MiB
allocated ~160 MiB
allocated ~176 MiB
allocated ~192 MiB
allocated ~208 MiB
allocated ~224 MiB
allocated ~240 MiB
(exit code: 0 — expect non-zero or timeout for a blocked attack)

========== Filesystem escape / tamper ==========
BLOCKED write system path (read-only root): OSError(30, 'Read-only file system')
BLOCKED write graded test file (ro bind mount): OSError(30, 'Read-only file system')
OK: write tmpfs (should succeed) — expected writable tmpfs
ALLOWED read read host via proc (should fail or be useless): got 64 bytes from /proc/1/root/etc/passwd
(exit code: 0 — expect non-zero or timeout for a blocked attack)

========== CPU busy-loop (needs ~30s kill) ==========
ALLOWED: CPU loop ran 120s (86482863 iterations) without timeout
(exit code: 0 — expect non-zero or timeout for a blocked attack)

========== Long sleep (timeout) ==========
sleeping 120s (expect runner timeout ~30s)...
ALLOWED: slept full 120s without timeout
(exit code: 0 — expect non-zero or timeout for a blocked attack)

========== Privileges / caps ==========
BLOCKED mount(2) without CAP_SYS_ADMIN: CalledProcessError(32, ['mount', '-t', 'tmpfs', 'tmpfs', '/tmp/mnt'])
BLOCKED chmod /etc: OSError(30, 'Read-only file system')
BLOCKED sudo: FileNotFoundError(2, 'No such file or directory')
BLOCKED append /etc/shadow: PermissionError(13, 'Permission denied')
OK: privilege operations denied
(exit code: 0 — expect non-zero or timeout for a blocked attack)

Done. Review output: BLOCKED / timeout = pass; ALLOWED = fail.
ubuntu@ip-10-0-0-232:~/Ramio/sandbox-security-probes$ 

"""
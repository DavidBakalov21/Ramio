"""Allocate until OOM; should die under --memory=256m."""
import sys

blocks: list[bytes] = []
chunk_mb = 16
try:
    while True:
        blocks.append(b"x" * (chunk_mb * 1024 * 1024))
        print(f"allocated ~{len(blocks) * chunk_mb} MiB", flush=True)
except MemoryError as e:
    print(f"BLOCKED: MemoryError after ~{len(blocks) * chunk_mb} MiB: {e!r}")
    sys.exit(0)

# Process may be SIGKILL'd by cgroup OOM before MemoryError
print(f"ALLOWED: held ~{len(blocks) * chunk_mb} MiB without limit")
sys.exit(1)

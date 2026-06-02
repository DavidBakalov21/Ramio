"""Burn CPU until host/backend kills the container (~30s RUNNER_TIMEOUT_MS)."""
import sys
import time

deadline = time.time() + 120
i = 0
while time.time() < deadline:
    i += 1
    # trivial hot loop
    _ = i * i

print(f"ALLOWED: CPU loop ran 120s ({i} iterations) without timeout")
sys.exit(1)

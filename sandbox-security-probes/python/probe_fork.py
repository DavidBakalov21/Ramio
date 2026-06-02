"""Fork until PID limit; should hit --pids-limit=128."""
import os
import sys

children = 0
try:
    while True:
        pid = os.fork()
        if pid == 0:
            os._exit(0)
        children += 1
        if children % 20 == 0:
            print(f"forked {children} children...", flush=True)
except OSError as e:
    print(f"BLOCKED after {children} forks: {e!r}")
    sys.exit(0)

print(f"ALLOWED: forked {children}+ without limit")
sys.exit(1)

#!/usr/bin/env python3
"""Sleep longer than runner timeout; backend should SIGKILL the container."""
import sys
import time

print("sleeping 120s (expect runner timeout ~30s)...", flush=True)
time.sleep(120)
print("ALLOWED: slept full 120s without timeout")
sys.exit(1)

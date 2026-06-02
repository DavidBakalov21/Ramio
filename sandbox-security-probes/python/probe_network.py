#!/usr/bin/env python3
"""Attempt outbound TCP; should fail with --network none."""
import socket
import sys

TARGETS = [
    ("1.1.1.1", 53),
    ("8.8.8.8", 53),
    ("github.com", 443),
]

for host, port in TARGETS:
    try:
        s = socket.create_connection((host, port), timeout=3)
        s.close()
        print(f"ALLOWED: connected to {host}:{port}")
        sys.exit(1)
    except OSError as e:
        print(f"BLOCKED {host}:{port}: {e!r}")

print("OK: all connection attempts failed")
sys.exit(0)

#!/usr/bin/env python3
"""Attempts that need caps or privilege escalation; --cap-drop ALL / no-new-privileges."""
import os
import subprocess
import sys

attacks: list[tuple[str, callable]] = []

def try_mount():
    os.makedirs("/tmp/mnt", exist_ok=True)
    subprocess.run(
        ["mount", "-t", "tmpfs", "tmpfs", "/tmp/mnt"],
        check=True,
        capture_output=True,
    )

def try_chmod_root():
    os.chmod("/etc", 0o777)

def try_setuid_shell():
    subprocess.run(["sudo", "-n", "id"], check=True, capture_output=True)

def try_write_shadow():
    with open("/etc/shadow", "a", encoding="utf-8") as f:
        f.write("backdoor\n")

attacks.extend(
    [
        ("mount(2) without CAP_SYS_ADMIN", try_mount),
        ("chmod /etc", try_chmod_root),
        ("sudo", try_setuid_shell),
        ("append /etc/shadow", try_write_shadow),
    ]
)

blocked = 0
for label, fn in attacks:
    try:
        fn()
        print(f"ALLOWED: {label}")
    except (OSError, subprocess.CalledProcessError, PermissionError) as e:
        print(f"BLOCKED {label}: {e!r}")
        blocked += 1

if blocked == len(attacks):
    print("OK: privilege operations denied")
    sys.exit(0)
sys.exit(1)

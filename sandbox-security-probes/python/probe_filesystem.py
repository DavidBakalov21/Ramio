"""Try writes outside allowed tmp; ro root and ro /workspace should block."""
import os
import sys

cases = [
    ("/etc/pwned-by-student", "write system path (read-only root)"),
    ("/workspace/tamper-tests.py", "write graded test file (ro bind mount)"),
    ("/tmp/allowed-scratch.txt", "write tmpfs (should succeed)"),
    ("/proc/1/root/etc/passwd", "read host via proc (should fail or be useless)"),
]

failed_escape = True
for path, label in cases:
    try:
        if path.startswith("/proc"):
            with open(path, "rb") as f:
                data = f.read(64)
            print(f"ALLOWED read {label}: got {len(data)} bytes from {path}")
            failed_escape = False
            continue
        with open(path, "w", encoding="utf-8") as f:
            f.write("escaped\n")
        if path.startswith("/tmp"):
            print(f"OK: {label} - expected writable tmpfs")
            os.unlink(path)
        else:
            print(f"ALLOWED: {label} - wrote {path}")
            failed_escape = False
    except OSError as e:
        print(f"BLOCKED {label}: {e!r}")

if failed_escape:
    print("OK: no escape writes outside /tmp")
    sys.exit(0)
sys.exit(1)

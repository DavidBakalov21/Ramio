#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

osascript <<EOF
tell application "Terminal"
    do script "cd '$SCRIPT_DIR/frontend-ramio' && npm run dev"
end tell
EOF

sleep 1

osascript <<EOF
tell application "Terminal"
    do script "cd '$SCRIPT_DIR/backend-ramio' && npm run start:dev"
end tell
EOF

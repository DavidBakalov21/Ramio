#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")"

FUNCTION_NAME="${1:-ZipToPrompt}"
REGION="${2:-eu-north-1}"

echo "Installing production dependencies…"
npm ci --omit=dev

echo "Creating function.zip…"
rm -f function.zip
zip -qr function.zip index.mjs package.json package-lock.json node_modules

echo "Uploading to Lambda $FUNCTION_NAME ($REGION)…"
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --zip-file "fileb://$(pwd)/function.zip"

echo "Done. Lambda handler should be: index.handler (file index.mjs, export handler)"

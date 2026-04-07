#!/usr/bin/env bash
# Build deployment zip (dependencies + handler) and push to AWS Lambda.
# Prerequisites: AWS CLI v2, credentials configured (aws configure or env vars).
#
# Usage:
#   ./deploy.sh                    # defaults: ZipToPrompt, eu-north-1
#   ./deploy.sh MyFunctionName     # custom function name
#   ./deploy.sh ZipToPrompt us-east-1

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

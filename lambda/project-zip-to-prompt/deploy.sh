#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")"

FUNCTION_NAME="${1:-ZipToPrompt}"
REGION="${2:-eu-north-1}"
DEPLOY_BUCKET="${DEPLOY_BUCKET:-ramio-file-storage}"
S3_KEY="lambda-deploy/${FUNCTION_NAME}.zip"
TIMEOUT="${LAMBDA_TIMEOUT:-60}"
MEMORY="${LAMBDA_MEMORY:-512}"

echo "Installing production dependencies…"
npm ci --omit=dev

echo "Pruning node_modules (docs, tests, source maps)…"
find node_modules \( -name '*.md' -o -name '*.markdown' -o -name '*.map' \) -delete 2>/dev/null || true
find node_modules -type d \( -name test -o -name tests -o -name __tests__ -o -name docs -o -name example -o -name examples \) -prune -exec rm -rf {} + 2>/dev/null || true

echo "Creating function.zip…"
rm -f function.zip
zip -qr function.zip index.mjs package.json package-lock.json node_modules
ZIP_SIZE="$(du -h function.zip | cut -f1)"
echo "Package size: ${ZIP_SIZE}"

echo "Uploading to s3://${DEPLOY_BUCKET}/${S3_KEY}…"
aws s3 cp function.zip "s3://${DEPLOY_BUCKET}/${S3_KEY}" --region "$REGION"

echo "Updating Lambda $FUNCTION_NAME ($REGION) from S3…"
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --s3-bucket "$DEPLOY_BUCKET" \
  --s3-key "$S3_KEY" \
  --no-cli-pager

echo "Waiting for code update…"
aws lambda wait function-updated \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION"

echo "Setting timeout=${TIMEOUT}s, memory=${MEMORY}MB…"
aws lambda update-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --timeout "$TIMEOUT" \
  --memory-size "$MEMORY" \
  --no-cli-pager

aws lambda wait function-updated \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION"

echo "Done. Lambda handler: index.handler (file index.mjs, export handler)"

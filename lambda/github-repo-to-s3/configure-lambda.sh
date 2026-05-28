#!/usr/bin/env bash

set -euo pipefail

FUNCTION_NAME="${1:-GithubRepoToS3}"
REGION="${2:-eu-north-1}"

aws lambda update-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --timeout 180 \
  --memory-size 1024 \
  --ephemeral-storage '{"Size": 2048}'

echo "Updated ${FUNCTION_NAME}: timeout=180s, memory=1024MB, /tmp=2048MB"

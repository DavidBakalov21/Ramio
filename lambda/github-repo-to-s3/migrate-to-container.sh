#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")"

FUNCTION_NAME="${1:-GithubRepoToS3}"
REGION="${2:-eu-north-1}"
IMAGE_TAG="${3:-latest}"
ECR_REPO="${ECR_REPO:-github-repo-to-s3}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"

DEFAULT_ROLE="arn:aws:iam::${ACCOUNT_ID}:role/GithubRepoToS3-role-aieknl2b"
DEFAULT_TIMEOUT=180
DEFAULT_MEMORY=1024
DEFAULT_EPHEMERAL=2048

ROLE="$DEFAULT_ROLE"
TIMEOUT="$DEFAULT_TIMEOUT"
MEMORY="$DEFAULT_MEMORY"
EPHEMERAL="$DEFAULT_EPHEMERAL"
DESCRIPTION=""
EXISTING_PACKAGE="Missing"

if aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --output json > /tmp/lambda-cfg.json 2>/dev/null; then
  EXISTING_PACKAGE="$(python3 -c "import json; print(json.load(open('/tmp/lambda-cfg.json'))['PackageType'])")"
  if [ "$EXISTING_PACKAGE" = "Image" ]; then
    echo "Function is already PackageType=Image. Run ./deploy.sh to update the image."
    exit 0
  fi
  ROLE="$(python3 -c "import json; print(json.load(open('/tmp/lambda-cfg.json'))['Role'])")"
  TIMEOUT="$(python3 -c "import json; print(json.load(open('/tmp/lambda-cfg.json'))['Timeout'])")"
  MEMORY="$(python3 -c "import json; print(json.load(open('/tmp/lambda-cfg.json'))['MemorySize'])")"
  EPHEMERAL="$(python3 -c "import json; c=json.load(open('/tmp/lambda-cfg.json')); print(c['EphemeralStorage']['Size'])")"
  DESCRIPTION="$(python3 -c "import json; print(json.load(open('/tmp/lambda-cfg.json')).get('Description') or '')")"
fi

echo ""
if [ "$EXISTING_PACKAGE" = "Zip" ]; then
  echo "This will DELETE and RECREATE: ${FUNCTION_NAME} (${REGION})"
else
  echo "Function not found - will CREATE: ${FUNCTION_NAME} (${REGION})"
fi
echo "  Role:      ${ROLE}"
echo "  Image:     ${IMAGE_URI}"
echo "  Timeout:   ${TIMEOUT}s"
echo "  Memory:    ${MEMORY} MB"
echo "  /tmp:      ${EPHEMERAL} MB"
echo ""
echo "Required: run ./deploy.sh first (builds a Lambda-compatible Docker V2 manifest)."
echo "If migrate failed with 'media type not supported', the old :latest in ECR was OCI - redeploy fixes it."
echo ""
read -r -p "Continue? [y/N] " CONFIRM
case "$(printf '%s' "$CONFIRM" | tr '[:upper:]' '[:lower:]')" in
  y|yes) ;;
  *)
    echo "Aborted."
    exit 1
    ;;
esac

if [ "$EXISTING_PACKAGE" = "Zip" ]; then
  echo "Deleting Zip function…"
  aws lambda delete-function \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
fi

echo "Creating container function…"
CREATE_ARGS=(
  --function-name "$FUNCTION_NAME"
  --package-type Image
  --code "ImageUri=${IMAGE_URI}"
  --role "$ROLE"
  --region "$REGION"
  --timeout "$TIMEOUT"
  --memory-size "$MEMORY"
  --ephemeral-storage "Size=${EPHEMERAL}"
  --architectures x86_64
)
if [ -n "$DESCRIPTION" ]; then
  CREATE_ARGS+=(--description "$DESCRIPTION")
fi

aws lambda create-function "${CREATE_ARGS[@]}"

echo "Waiting for function to become active…"
aws lambda wait function-active-v2 \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION"

echo ""
echo "Done. ARN: arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"
echo "Future code updates: ./deploy.sh"

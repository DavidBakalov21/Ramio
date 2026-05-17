#!/usr/bin/env bash
# Build container image, push to ECR, and update the Lambda function.
# Prerequisites: Docker, AWS CLI v2, credentials with ECR + Lambda permissions.
#
# Usage:
#   ./deploy.sh
#   ./deploy.sh GithubRepoToS3 eu-north-1 latest

set -euo pipefail
cd "$(dirname "$0")"

FUNCTION_NAME="${1:-GithubRepoToS3}"
REGION="${2:-eu-north-1}"
IMAGE_TAG="${3:-latest}"
ECR_REPO="${ECR_REPO:-github-repo-to-s3}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE_URI="${REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"

echo "Logging in to ECR (${REGISTRY})…"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

# Lambda requires Docker Image Manifest V2 — not OCI + attestations (Docker Desktop default).
export BUILDX_NO_DEFAULT_ATTESTATIONS=1
docker buildx inspect --bootstrap >/dev/null 2>&1 || true

echo "Building and pushing (linux/amd64, Docker V2 manifest)…"
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  --sbom=false \
  --output "type=image,name=${IMAGE_URI},push=true,oci-mediatypes=false" \
  .

MEDIA_TYPE="$(aws ecr describe-images \
  --repository-name "$ECR_REPO" \
  --region "$REGION" \
  --image-ids imageTag="$IMAGE_TAG" \
  --query 'imageDetails[0].imageManifestMediaType' \
  --output text 2>/dev/null || echo "unknown")"

echo "ECR manifest media type: ${MEDIA_TYPE}"
if [ "$MEDIA_TYPE" != "application/vnd.docker.distribution.manifest.v2+json" ]; then
  echo ""
  echo "WARNING: Image may still be rejected by Lambda."
  echo "Try: docker buildx prune -f && ./deploy.sh"
  echo "Or upgrade Docker Desktop and ensure buildx is enabled."
fi

PACKAGE_TYPE="$(aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query PackageType \
  --output text 2>/dev/null || echo "Missing")"

if [ "$PACKAGE_TYPE" = "Zip" ]; then
  echo ""
  echo "ERROR: ${FUNCTION_NAME} is still PackageType=Zip."
  echo "Image is in ECR: ${IMAGE_URI}"
  echo "Run once:  ./migrate-to-container.sh ${FUNCTION_NAME} ${REGION} ${IMAGE_TAG}"
  exit 1
fi

if [ "$PACKAGE_TYPE" = "Missing" ]; then
  echo ""
  echo "Function not found. Image pushed to: ${IMAGE_URI}"
  echo "Run:  ./migrate-to-container.sh ${FUNCTION_NAME} ${REGION} ${IMAGE_TAG}"
  exit 0
fi

echo "Updating Lambda ${FUNCTION_NAME} (${REGION})…"
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --image-uri "$IMAGE_URI"

aws lambda wait function-updated \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION"

echo "Done. Image: ${IMAGE_URI}"

#!/usr/bin/env bash
set -euo pipefail

# Builds images locally (cross-compiled for the server's linux/amd64, since
# most dev machines here are Apple Silicon) instead of on the memory-starved
# Proxmox box, ships them over, then runs deploy.sh with SKIP_BUILD=1 so it
# only does migrate + restart + health check.
#
# Usage: ./ship.sh <tag>   e.g. ./ship.sh v0.2.2

cd "$(dirname "$0")"

REMOTE_HOST="root@192.168.0.226"
REMOTE_DIR="/opt/apps/treasury-ops"
PLATFORM="linux/amd64"

TARGET_TAG="${1:?Usage: ./ship.sh <tag>   e.g. ./ship.sh v0.2.2}"

if ! git rev-parse "${TARGET_TAG}" > /dev/null 2>&1; then
  echo "!!  Tag '${TARGET_TAG}' not found locally. Run 'git fetch --tags' first."
  exit 1
fi

WORKDIR="$(mktemp -d)"
cleanup() {
  git worktree remove --force "${WORKDIR}/src" 2>/dev/null || true
  rm -rf "${WORKDIR}"
}
trap cleanup EXIT

echo "==> Checking out ${TARGET_TAG} into a scratch worktree (your working tree is untouched)..."
git worktree add --quiet -d "${WORKDIR}/src" "${TARGET_TAG}"
cd "${WORKDIR}/src"

echo "==> Building treasury-ops-api:local for ${PLATFORM}..."
docker buildx build --platform "${PLATFORM}" -f apps/api/Dockerfile -t treasury-ops-api:local --load .

echo "==> Building treasury-ops-web:latest for ${PLATFORM}..."
docker buildx build --platform "${PLATFORM}" -f apps/web/Dockerfile -t treasury-ops-web:latest \
  --build-arg NEXT_PUBLIC_API_URL=/api \
  --build-arg INTERNAL_API_URL=http://api:4000/api \
  --load .

IMAGE_TAR="${WORKDIR}/treasury-ops-images.tar.gz"
echo "==> Saving images to ${IMAGE_TAR}..."
docker save treasury-ops-api:local treasury-ops-web:latest | gzip > "${IMAGE_TAR}"
echo "    $(du -h "${IMAGE_TAR}" | cut -f1)"

echo "==> Copying to ${REMOTE_HOST}..."
scp -q "${IMAGE_TAR}" "${REMOTE_HOST}:/tmp/treasury-ops-images.tar.gz"

echo "==> Loading images and deploying on the server..."
ssh "${REMOTE_HOST}" "
  set -euo pipefail
  gunzip -c /tmp/treasury-ops-images.tar.gz | docker load
  rm -f /tmp/treasury-ops-images.tar.gz
  cd ${REMOTE_DIR}
  git fetch origin main --tags --quiet
  # deploy.sh checks out TARGET_TAG on itself mid-run -- refresh it from main
  # first so SKIP_BUILD support is guaranteed present regardless of which
  # (possibly older) tag deploy.sh is about to check out for the app code.
  git checkout origin/main -- deploy.sh
  SKIP_BUILD=1 bash deploy.sh ${TARGET_TAG}
"

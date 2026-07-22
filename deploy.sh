#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

APP_URL="http://localhost:3006"

echo "==> Fetching tags..."
git fetch --tags --quiet

TARGET_TAG="${1:-}"
if [ -z "${TARGET_TAG}" ]; then
  TARGET_TAG="$(git tag --list 'v*' --sort=-v:refname | head -n1)"
fi

if [ -z "${TARGET_TAG}" ]; then
  echo "!!  No tags found and none specified."
  echo "!!  Usage: ./deploy.sh [tag]   e.g. ./deploy.sh v0.2.0"
  exit 1
fi

if ! git rev-parse "${TARGET_TAG}" > /dev/null 2>&1; then
  echo "!!  Tag '${TARGET_TAG}' not found (did you 'git fetch --tags'?)."
  exit 1
fi

PREV_SHA="$(git rev-parse --short HEAD)"
PREV_TAG="$(git describe --tags --exact-match 2>/dev/null || echo "${PREV_SHA}")"

echo "==> Current version: ${PREV_TAG}"
echo "==> Checking out ${TARGET_TAG}..."
git checkout --quiet "${TARGET_TAG}"

NEW_SHA="$(git rev-parse --short HEAD)"
export GIT_SHA="${TARGET_TAG}+${NEW_SHA}"

if [ "${PREV_TAG}" = "${TARGET_TAG}" ]; then
  echo "==> Already on ${TARGET_TAG}. Rebuilding anyway (env/Dockerfile changes)..."
fi
echo "==> Deploying ${TARGET_TAG} (${NEW_SHA})"

echo "==> Building images..."
docker compose --env-file .env build

echo "==> Running database migrations (one-shot)..."
# Runs drizzle-kit migrate and exits; failure aborts the deploy BEFORE anything restarts
docker compose --env-file .env run --rm migrate

echo "==> Restarting containers..."
docker compose --env-file .env up -d

echo "==> Pruning old images..."
docker image prune -f

echo "==> Waiting for health checks..."
for i in $(seq 1 12); do
  if curl -sf "${APP_URL}/api/healthz" > /dev/null && curl -sf "${APP_URL}" > /dev/null; then
    DEPLOYED_SHA="$(curl -sf "${APP_URL}/api/healthz" | grep -o '"sha":"[^"]*"' || true)"
    echo "    TreasuryOps is healthy at ${APP_URL} (${DEPLOYED_SHA:-sha unknown})"

    echo "==> Smoke test: write + reverse against canary account..."
    if docker compose exec -T api node dist/scripts/smoke.js; then
      echo "    Smoke test passed. Deploy of ${TARGET_TAG} complete."
      exit 0
    else
      echo "    SMOKE TEST FAILED — app is up but misbehaving."
      break
    fi
  fi
  echo "    ...waiting (${i}/12)"
  sleep 5
done

echo ""
echo "!!  DEPLOY FAILED for ${TARGET_TAG}"
echo "!!  Logs:      docker compose logs --tail=50 api worker web"
echo "!!  Rollback:  ./deploy.sh ${PREV_TAG}"
echo "!!  (Migrations are additive-only by policy, so old code runs on new schema.)"
exit 1

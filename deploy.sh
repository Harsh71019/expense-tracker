#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

APP_URL="http://localhost:3006"
PREV_SHA="$(git rev-parse --short HEAD)"

echo "==> Current version: ${PREV_SHA}"
echo "==> Pulling latest code..."
git pull
NEW_SHA="$(git rev-parse --short HEAD)"
export GIT_SHA="${NEW_SHA}"

if [ "${PREV_SHA}" = "${NEW_SHA}" ]; then
  echo "==> No new commits. Rebuilding anyway (env/Dockerfile changes)..."
fi
echo "==> Deploying ${NEW_SHA}"

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
    echo "    Vyaya is healthy at ${APP_URL} (${DEPLOYED_SHA:-sha unknown})"

    echo "==> Smoke test: write + reverse against canary account..."
    if docker compose exec -T api node dist/scripts/smoke.js; then
      echo "    Smoke test passed. Deploy of ${NEW_SHA} complete."
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
echo "!!  DEPLOY FAILED for ${NEW_SHA}"
echo "!!  Logs:      docker compose logs --tail=50 api worker web"
echo "!!  Rollback:  git checkout ${PREV_SHA} && docker compose --env-file .env up -d --build"
echo "!!  (Migrations are additive-only by policy, so old code runs on new schema.)"
exit 1

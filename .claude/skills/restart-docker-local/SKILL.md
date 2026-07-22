---
name: restart-docker-local
description: Use when the user asks to rebuild/restart TreasuryOps locally in Docker (e.g. "rebuild docker", "restart the stack", "rebuild and restart") after code changes — rebuilds images, applies migrations, restarts containers, and verifies health.
---

# Restart TreasuryOps Locally in Docker

## Overview

TreasuryOps's local Docker stack (`docker-compose.yml`) runs `postgres` → `migrate`
(one-shot) → `api` + `worker` → `web`, behind an `nginx` `proxy` (the only
published container, `localhost:3006`). After code changes, images must be
rebuilt and containers restarted for the change to actually be running —
`pnpm build`/`pnpm typecheck` passing does **not** mean the running stack
reflects the new code.

Always run these from the repo root, with `.env` already present (`cp
env.example .env` if not — see README.md).

## Step 1: Check what changed

```bash
git status --short
git diff --stat
```

This decides whether a migration step is needed (Step 3):

- Any change under `apps/api/src/common/db/schema/` → a new migration is
  needed first (`drizzle-kit generate`, not covered by this skill — see
  `apps/api/drizzle/` for the existing migration files and naming
  convention). Don't skip straight to Step 2 if the schema changed but no
  new file exists in `apps/api/drizzle/` yet.
- Any other `apps/api` or `apps/web` change → rebuild + restart is enough,
  Step 3's `migrate` run is a fast no-op if there's nothing new to apply.
- Docs-only / non-code changes → no rebuild needed at all.

## Step 2: Rebuild images

```bash
docker compose --env-file .env build
```

Only touched services actually rebuild (Docker layer caching) — a
`apps/web`-only change won't re-trigger the `api` image build, and vice
versa.

## Step 3: Apply migrations (one-shot, gates everything else)

```bash
docker compose --env-file .env run --rm migrate
```

This runs `node_modules/drizzle-kit/bin.cjs migrate` inside the built image.
**Do not** try to invoke `node_modules/.bin/drizzle-kit` directly under
`node` — the image's distroless entrypoint runs `node <file>` directly and
can't execute `.bin/`'s POSIX shell shim (`SyntaxError: missing ) after
argument list`). If this step fails, fix the migration before proceeding —
`migrate` gates `api`/`worker` startup in the compose dependency graph, and a
failed migration on real Postgres means a real bug, not a flake.

## Step 4: Restart containers

```bash
docker compose --env-file .env up -d
```

Recreates only the containers whose image actually changed (or whose
`depends_on` upstream did, e.g. `migrate` re-running always recreates
`api`/`worker`/`web` after it, per their `depends_on: condition:
service_completed_successfully` / `service_healthy`).

## Step 5: Verify

```bash
docker compose ps --format 'table {{.Name}}\t{{.Status}}'
curl -sf http://localhost:3006/api/readyz
```

Expect every container `healthy` (or `Up` for `proxy`, which has no
healthcheck) and `readyz` to return
`{"status":"ok","postgres":"ok","redis":"ok"}`. If `readyz` fails or hangs,
check logs before assuming it's still starting:

```bash
docker compose logs --tail=50 api worker web
```

## Gotchas

- **Postgres's host port is loopback-only by default** (`127.0.0.1:5433`,
  via `POSTGRES_BIND_ADDR` in `docker-compose.yml`/`env.example`) — this is
  deliberate (prevents LAN/internet exposure in production) and doesn't
  affect anything in this skill; `localhost:5433` still works fine for
  local `psql`/GUI clients on the same machine.
- **`docker compose down` vs `stop`**: `down` removes containers and the
  network but keeps the named Postgres volume (data survives) unless you
  pass `-v`. Prefer `up -d` (Step 4) over `down` + `up` for a routine
  restart — `down` is only needed if you want a clean network/container
  recreate, not for a normal rebuild-and-restart cycle.
- **`pull_policy: never`** on `api`/`worker`/`web` — Compose will never try
  to pull these from a registry, only use the locally built image. If a
  rebuild seems to not take effect, confirm Step 2 actually completed
  before Step 4 ran.

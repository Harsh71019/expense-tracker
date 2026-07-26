# TreasuryOps — Deployment (matches the /opt/apps pattern)

Drop-in section for `DEPLOYMENT.md`. Same LXC, same conventions, port **3006**.

---

## App 3: TreasuryOps (Expense Tracker)

**Path on server:** `/opt/apps/treasury-ops/`
**URL:** http://192.168.0.226:3006

### How it differs from Taskflow / JS Mastery

|              | Taskflow / JS Mastery             | TreasuryOps                                                                                 |
| ------------ | --------------------------------- | -------------------------------------------------------------------------------------------- |
| Containers   | 2 (nginx SPA + Express)           | 5 (nginx proxy + Next.js SSR + NestJS API + BullMQ worker + one-shot `migrate`)               |
| Frontend     | Vite static build served by nginx | Next.js **server** — nginx proxies to it, doesn't serve files                                |
| Exposed port | nginx :80 → host                  | same, nginx :80 → host **3006** (only exposed container)                                     |
| Deploy       | `git pull && up -d --build`       | same, **plus** one-shot `migrate` container runs before restart, **plus** smoke test after   |
| State        | none local                        | none local — Postgres + Redis are shared infra on container 102, no volumes on this LXC      |

### Container map

```
Browser → nginx:3006
             ├── /api/*         → api:4000   (NestJS — includes /api/auth/* Better Auth)
             ├── /admin/queues  → api:4000   (Bull Board, auth-guarded)
             └── /*             → web:3000   (Next.js SSR)
worker  → shared Postgres + Redis on container 102   (crons, CSV parsing, notifications — no exposed port)
migrate → runs `drizzle-kit migrate` against container 102, exits    (gates api/worker startup)
```

### `.env` (at `/opt/apps/treasury-ops/.env`)

See `env.example` in the repo. The two footguns:

```
AUTH_COOKIE_SECURE=false      # same reason as Taskflow's COOKIE_SECURE=false —
                              # plain HTTP on LAN, browsers drop Secure cookies
TRUSTED_ORIGINS=http://192.168.0.226:3006   # Better Auth CSRF origin check;
                                            # wrong value = login silently fails
```

### First deploy

```bash
# Clone
ssh root@192.168.0.226 "git clone https://github.com/Harsh71019/treasury-ops.git /opt/apps/treasury-ops"

# Write .env (copy from env.example, fill secrets)
ssh root@192.168.0.226 "vim /opt/apps/treasury-ops/.env && chmod 600 /opt/apps/treasury-ops/.env"

# Deploy (builds, migrates, starts, health-checks, smoke-tests)
ssh root@192.168.0.226 "chmod +x /opt/apps/treasury-ops/deploy.sh && cd /opt/apps/treasury-ops && bash deploy.sh"

# Create your account at http://192.168.0.226:3006, then lock the door:
ssh root@192.168.0.226 "sed -i 's/DISABLE_SIGNUP=false/DISABLE_SIGNUP=true/' /opt/apps/treasury-ops/.env && cd /opt/apps/treasury-ops && docker compose --env-file .env up -d api"
```

### Local foundation check

Copy `env.example` to `.env` and point `DATABASE_URL`/`REDIS_URL` at reachable Postgres/Redis instances — container 102 if you want to develop against the real shared infra, or `host.docker.internal` if you have local Homebrew/Docker instances of either running on your Mac.

```bash
docker compose --env-file .env up --build
```

Never point `DATABASE_URL` at container 102's production `treasury_ops` database for development or test data. Either give yourself a separate dev database on container 102, or use `docker-compose.yml`'s throwaway local `postgres` service instead (`docker compose --env-file .env up -d postgres`, or set `COMPOSE_PROFILES=local` in `.env` — see README.md).

### Shared Postgres + Redis infrastructure (container 102)

Both are deployed on a shared LXC (container 102) rather than per-app, so every home-lab app reuses one Postgres and one Redis instead of running N separate instances — much lighter on RAM/maintenance, and one backup job covers every app. The tradeoff: it's a single point of failure across all apps (a crash, OOM, or botched major-version upgrade takes every app's DB down at once), an acceptable trade for personal projects without uptime SLAs.

Container 102 itself is already provisioned and out of scope here (managed independently of this repo). What TreasuryOps needs from it:

- Its own Postgres database (`treasury_ops`) and a separately scoped database user — never share a user/db with another app on that instance.
- A distinct Redis database index and key prefix — TreasuryOps uses database `2` and the `treasury-ops:` key namespace (see `infra/redis` for the historical single-app Redis compose definition this superseded).
- Network reachability from TreasuryOps' own LXC (192.168.0.226) to container 102 on 5432/6379, firewalled to only the application hosts that need it.

`DATABASE_URL`/`REDIS_URL` in `.env` point at container 102's address — see `env.example`.

### Update

```bash
ssh root@192.168.0.226 "cd /opt/apps/treasury-ops && bash deploy.sh"
```

`deploy.sh` here does more than the others — order matters:

```
git pull
docker compose build                 # build BEFORE touching running containers
docker compose run --rm migrate      # migrations gate the deploy; failure aborts
docker compose up -d                 # restart onto new images
health check ×12 (60s)               # /api/healthz + /
smoke test                           # write + reverse on canary account
on failure: prints exact rollback command with the previous git SHA
```

`deploy.sh` exports the checked-out commit as `GIT_SHA` before Compose starts the API, so `/api/healthz` reports the actual deployed revision.

### Useful commands

```bash
# All TreasuryOps containers
ssh root@192.168.0.226 "docker ps --filter name=treasury-ops"

# Live logs
ssh root@192.168.0.226 "docker logs -f treasury-ops-api-1"
ssh root@192.168.0.226 "docker logs -f treasury-ops-worker-1"     # cron/import issues live here

# Health
curl http://192.168.0.226:3006/api/healthz                  # returns git SHA too

# Queue dashboard (login first)
open http://192.168.0.226:3006/admin/queues

# Restart without rebuild
ssh root@192.168.0.226 "docker compose -f /opt/apps/treasury-ops/docker-compose.yml restart api worker web"

# Run migrations manually
ssh root@192.168.0.226 "cd /opt/apps/treasury-ops && docker compose --env-file .env run --rm migrate"

# Shell into API container
ssh root@192.168.0.226 "docker exec -it treasury-ops-api-1 sh"

# Rollback to a known-good SHA
ssh root@192.168.0.226 "cd /opt/apps/treasury-ops && git checkout <sha> && docker compose --env-file .env up -d --build"
```

### Host crontab additions (LXC, `crontab -e`)

The app's business crons (recurring txns, rollups, alerts) run **inside the worker** via BullMQ — nothing needed on TreasuryOps' host for those. Postgres backups are no longer per-app: since Postgres moved to shared infra on container 102, its single centralized backup job covers TreasuryOps' `treasury_ops` database along with every other app's — nothing to add to this LXC's crontab for that either.

### Notes

- **Port registry is now:** 3000 Taskflow · 3001 JS Mastery · 3003 Books · **3006 TreasuryOps**
- Redis is deliberately `noeviction` — evicting queue data corrupts jobs; 256mb is generous for this workload
- Migrations are **additive-only by policy**, which is what makes the printed rollback command safe
- When NPMplus + TLS eventually fronts this: flip `AUTH_COOKIE_SECURE=true`, update `BETTER_AUTH_URL`/`TRUSTED_ORIGINS` to the https hostname, and passkeys will start working (WebAuthn requires a secure context — over plain HTTP, Face ID login is unavailable; everything else works)

# TreasuryOps — Deployment (matches the /opt/apps pattern)

Drop-in section for `DEPLOYMENT.md`. Same LXC, same conventions, port **3006**.

---

## App 3: TreasuryOps (Expense Tracker)

**Path on server:** `/opt/apps/treasury-ops/`
**URL:** http://192.168.0.226:3006

### How it differs from Taskflow / JS Mastery

|              | Taskflow / JS Mastery             | TreasuryOps                                                                                      |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------------------ |
| Containers   | 2 (nginx SPA + Express)           | 6 (nginx proxy + Next.js SSR + NestJS API + BullMQ worker + PostgreSQL + one-shot `migrate`) |
| Frontend     | Vite static build served by nginx | Next.js **server** — nginx proxies to it, doesn't serve files                              |
| Exposed port | nginx :80 → host                  | same, nginx :80 → host **3006** (only exposed container)                                   |
| Deploy       | `git pull && up -d --build`       | same, **plus** one-shot `migrate` container runs before restart, **plus** smoke test after |
| State        | none local                        | shared Redis volume (queues) + local PostgreSQL volume (named volume, host-backed)          |

### Container map

```
Browser → nginx:3006
             ├── /api/*         → api:4000   (NestJS — includes /api/auth/* Better Auth)
             ├── /admin/queues  → api:4000   (Bull Board, auth-guarded)
             └── /*             → web:3000   (Next.js SSR)
worker  → shared Redis + Postgres   (crons, CSV parsing, notifications — no exposed port)
migrate → runs `drizzle-kit migrate`, exits    (gates api/worker startup)
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

Copy `env.example` to `.env`, set a `POSTGRES_PASSWORD`, and point `REDIS_URL` at `redis://host.docker.internal:6379/2` to use the Homebrew Redis service running on your Mac (if your local Redis requires authentication, add its URL-encoded password to that URL).

```bash
docker compose --env-file .env up --build
```

Postgres now runs as its own container in this same Compose stack (named volume, not an external service) — there's no separate staging database to point at. Never point `DATABASE_URL` at the production `treasury-ops` database for development or test data; use this stack's own local container instead.

### Shared Redis infrastructure

Redis is intentionally deployed separately from TreasuryOps so other applications can reuse it. On the Redis host:

```bash
cd infra/redis
cp .env.example .env
# Set a long, URL-safe REDIS_PASSWORD in .env.
docker compose up -d
```

The Compose definition binds Redis to loopback only. For a separate application LXC, change the bind address deliberately and firewall port 6379 to only the application hosts. Give each application a distinct Redis database and key prefix; TreasuryOps uses database `2` and the `treasury-ops:` key namespace.

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

The app's business crons (recurring txns, rollups, alerts) run **inside the worker** via BullMQ — nothing needed on the host. Only the backup lives at host level so it works even if the app is down:

```cron
# Nightly Postgres dump → NAS (04:00 IST)
0 4 * * * /opt/apps/treasury-ops/deploy/backup.sh >> /var/log/treasury-ops-backup.log 2>&1
```

`backup.sh`: `docker compose --env-file /opt/apps/treasury-ops/.env exec -T postgres pg_dump -U treasury-ops -d treasury-ops | gzip > /mnt/nas/backups/treasury-ops/$(date +\%F).sql.gz` + retention prune (30 daily / 12 monthly) + weekly `rclone` offsite. Runs against the `postgres` container directly (not the host's published port, which is loopback-only per `POSTGRES_BIND_ADDR` in `env.example`) — `docker compose exec` works from the host regardless of that binding.

### Notes

- **Port registry is now:** 3000 Taskflow · 3001 JS Mastery · 3003 Books · **3006 TreasuryOps**
- Redis is deliberately `noeviction` — evicting queue data corrupts jobs; 256mb is generous for this workload
- Migrations are **additive-only by policy**, which is what makes the printed rollback command safe
- When NPMplus + TLS eventually fronts this: flip `AUTH_COOKIE_SECURE=true`, update `BETTER_AUTH_URL`/`TRUSTED_ORIGINS` to the https hostname, and passkeys will start working (WebAuthn requires a secure context — over plain HTTP, Face ID login is unavailable; everything else works)

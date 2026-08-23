# TreasuryOps — Deployment (matches the /opt/apps pattern)

Drop-in section for `DEPLOYMENT.md`. Same LXC, same conventions, port **3006**.

---

## App 3: TreasuryOps (Expense Tracker)

**Path on server:** `/opt/apps/treasury-ops/`
**URL:** http://192.168.0.226:3006

### How it differs from Taskflow / JS Mastery

|              | Taskflow / JS Mastery             | TreasuryOps                                                                                |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------------------ |
| Containers   | 2 (nginx SPA + Express)           | 5 (nginx proxy + Next.js SSR + NestJS API + BullMQ worker + one-shot `migrate`)            |
| Frontend     | Vite static build served by nginx | Next.js **server** — nginx proxies to it, doesn't serve files                              |
| Exposed port | nginx :80 → host                  | same, nginx :80 → host **3006** (only exposed container)                                   |
| Deploy       | `git pull && up -d --build`       | same, **plus** one-shot `migrate` container runs before restart, **plus** smoke test after |
| State        | none local                        | none local — Postgres + Redis are shared infra on container 102, no volumes on this LXC    |

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

### Observability (Seq)

Structured logs (pino JSON) can additionally ship to [Seq](https://datalust.co/seq), a self-hosted log server, for searchable log history beyond `docker logs`. Deployed as a standalone container directly on the TreasuryOps app LXC (192.168.0.226) — not part of `docker-compose.yml`, since it's infra tooling rather than an app service:

```bash
ssh root@192.168.0.226 "docker run --name seq -d \
  --restart unless-stopped \
  -e ACCEPT_EULA=Y \
  -e SEQ_FIRSTRUN_ADMINPASSWORD='<generated at creation>' \
  -p 5341:80 \
  -p 5342:5341 \
  -v seq-data:/data \
  datalust/seq:latest"
```

- UI: `http://192.168.0.226:5341` (`admin` / the password set at first run — rotate via the UI once logged in).
- Ingestion endpoint: `http://192.168.0.226:5342` (raw CLEF, used by the `pino-seq` stream).
- With authentication on, ingestion requires an API key (create one under Settings → API Keys in the UI) — set it as `SEQ_API_KEY` below.

TreasuryOps opts in via two optional env vars (unset = Seq shipping disabled; logs still go to stdout/`docker logs` exactly as before):

```
SEQ_URL=http://192.168.0.226:5342
SEQ_API_KEY=<api key created in Seq's UI>
```

Wired in `apps/api/src/common/logging/pino-destination.ts` via `pino.multistream`, alongside the existing stdout/`pino-pretty` destination — enabling or disabling Seq never changes what lands in `docker logs`.

**Response bodies** are captured too, via a global `ResponseBodyLoggingInterceptor` (`apps/api/src/common/logging/response-body-logging.interceptor.ts`) that attaches the controller's return value to the request's log line as `resBody`. Two guardrails: `/api/v1/auth/*` routes are skipped entirely (Better Auth responses can carry session tokens), and any response serializing past ~8KB is truncated to a capped string instead of the full object. `PINO_REDACT_PATHS`' existing `*.password`/`*.secret`/`*.token`/`*.description` wildcards apply to `resBody`'s top-level fields the same way they already apply to `req`'s.

**Disk note:** Seq refuses new events once free disk space on the LXC drops below its internal safety threshold (the disk here is small — check `df -h /`; `docker builder prune -f` reclaims stale build cache). If ingestion silently stops, check `docker logs seq` for `Skipping indexing; free storage space...` before assuming the app-side wiring is broken.

**Retention:** a 30-day retention policy is configured directly in Seq (Settings → Retention, or `POST /api/retentionpolicies` with `{"RetentionTime":"30.00:00:00","DataSource":"Stream"}`) — Seq prunes events older than that on its own internal schedule, no TreasuryOps-side cron needed. Adjust the window from the UI if 30 days proves too much/little for the disk.

### Ops notifications (ntfy)

ntfy already runs on the same box (`http://192.168.0.226:3007`, no auth) alongside every other home-lab app. `apps/api/src/common/observability/ntfy-ops-notifier.service.ts` pushes to it for two kinds of operational signal — deliberately separate from the domain-notification outbox (`notifications/`, still `LoggingNotificationAdapter` until that has a real adapter):

- **Cron run outcomes** — one push per run for the daily/weekly business jobs only (`ScheduledRunCoordinator`'s `cadence: "daily"` jobs, plus `BillGenerationCron` and `ForecastingScheduleService` which don't route through the coordinator). High-frequency infra jobs (import dispatch every 10s, the notification-outbox sweep every minute, the scheduler watchdog every 15min) stay silent — notifying on those would be thousands of pushes a day. Both success (✅) and failure (❌, high priority) push.
- **Process boot** — one push each time `main.ts` (api) or `worker.ts` (worker) starts, tagged with `GIT_SHA`. Since a Docker restart is always a fresh process boot, this covers "the server restarted" for any reason (deploy, crash-restart, manual restart) without needing to distinguish the cause.

Configured via the same `NTFY_URL`/`NTFY_TOPIC` env vars as the (currently unused) domain-notification adapter:

```
NTFY_URL=http://192.168.0.226:3007
NTFY_TOPIC=treasury_ops
```

Both unset (default) disables ops pushes entirely — `NtfyOpsNotifierService.notify()` no-ops and every call site's `await` returns immediately. Delivery is fire-and-forget: a failed push is logged (`ntfy.push_failed`) but never thrown, so a flaky ntfy server can't take down a cron run or block process boot.

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

### Infrastructure backup timers

The app's business crons (recurring txns, rollups, alerts) run **inside the
worker** via BullMQ — nothing is added to TreasuryOps' app-LXC crontab.

PostgreSQL backups run independently on shared-infrastructure LXC 102. The
versioned implementation and recovery runbook live under
[`infra/backup`](../infra/backup/README.md). Its systemd timers create
six-hour logical dumps, maintain a local and an encrypted off-site Restic
repository, and restore the off-site copy into an isolated PostgreSQL 18
container every month.

The systemd timers must not be enabled until one manual backup and one restore
test both succeed. Nightly Proxmox/PBS backups of LXC 102 and the TreasuryOps
app LXC remain separate host-level jobs; the latter protects the production
`.env`, which is not reachable from LXC 102.

### Notes

- **Port registry is now:** 3000 Taskflow · 3001 JS Mastery · 3003 Books · **3006 TreasuryOps**
- Redis is deliberately `noeviction` — evicting queue data corrupts jobs; 256mb is generous for this workload
- Migrations are **additive-only by policy**, which is what makes the printed rollback command safe
- When NPMplus + TLS eventually fronts this: flip `AUTH_COOKIE_SECURE=true`, update `BETTER_AUTH_URL`/`TRUSTED_ORIGINS` to the https hostname, and passkeys will start working (WebAuthn requires a secure context — over plain HTTP, Face ID login is unavailable; everything else works)

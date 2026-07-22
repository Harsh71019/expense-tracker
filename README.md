# TreasuryOps

A personal expense tracker built as an **append-only, double-entry-style ledger**, where correctness of money math is the product — inspired by [Firefly III](https://www.firefly-iii.org/). Work in progress.

pnpm workspace monorepo:

```
apps/api           NestJS REST API — Better Auth, PostgreSQL (Drizzle ORM), BullMQ workers, crons
apps/web           Next.js App Router frontend (SSR, server components)
packages/shared    zod schemas + types shared by both apps (single source of truth)
packages/config     shared tsconfig
apps/api/drizzle/  drizzle-kit migrations (ordered, additive-only)
infra/redis/        local Redis compose service
```

See `BACKEND.md` for the full target architecture, `AGENTS.md` for the non-negotiable engineering rules (money-handling invariants, TypeScript strictness, testing gates), and `IMPLEMENTATION-PLAN.md` for the phased build-out.

## Features

**Backend (`apps/api`) — feature-complete for the core ledger + several planned modules:**

- **Auth** — Better Auth (email/password), session cookies, `AuthGuard` + `@CurrentUser()`, per-user data isolation
- **Accounts & categories** — CRUD, archive-not-delete
- **Transactions** — create (expense/income), cursor-paginated list with filters (`accountId`, `categoryId`, date range, description search), non-monetary edits (description/tags/category), reversal via compensating entries
- **Transfers** — atomic two-leg transfers between accounts, group-level reversal
- **Idempotency** — `Idempotency-Key` header support on money-writing endpoints; duplicate requests replay the original result instead of double-posting
- **Net-worth assets** — loans given/taken, fixed deposits, gold/silver, manually valued investments; append-only valuation history; aggregate `GET /v1/net-worth`
- **CSV imports** — upload, bank column-mapping presets, staged-row preview (dedupe/problem flags), per-row edits, chunked resumable commit, batch revert
- **Category rules** — user-defined auto-categorization rules + suggester
- **Recurring transactions** — rule CRUD + nightly materializer cron (`Asia/Kolkata`)
- **Reports** — monthly rollups + nightly refresh cron
- **Notifications** — outbox pattern, BullMQ delivery worker, circuit breaker on outbound calls, periodic sweep
- **Balance verification** — weekly consistency-check cron comparing ledger vs. computed balances
- **CSV export**
- **Standardized API errors** — RFC 7807 problem+json, typed `DomainError` codes throughout, per-field validation errors
- **Health checks** — `/healthz` (liveness), `/readyz` (Postgres/Redis ping)
- **OpenAPI spec + generated client** — `pnpm gen:client` generates `apps/api/openapi.json` (via `@asteasolutions/zod-to-openapi`) and a typed `apps/web/src/lib/api/generated/schema.d.ts` from it

Every money write is atomic (single PostgreSQL transaction: insert + balance update + audit entry, via the `withTxn` helper), and all amounts are stored as integer paise — never floats.

**Frontend (`apps/web`) — wired up to the backend:**

Real routes under `app/(app)/` (dashboard, `transactions`, `transactions/[transactionId]`, `add`, `accounts`, `categories`, `category-rules`, `assets`, `assets/[assetId]`, `transfers`, `imports`, `export`, `reports`, `more`), each fetching real data through generated-client server loaders under the matching `features/*/server/`. No frontend UI yet for recurring rules — the backend module exists (`apps/api/src/recurring/`) but no `features/recurring` counterpart has been built.

## Installing and running

**Prerequisites:**

- Node `24.18.x` (see `.nvmrc`)
- pnpm `10.28.1`
- Docker (for a local PostgreSQL 18 container and Redis — see below; not needed if you point `DATABASE_URL`/`REDIS_URL` at instances you already have running)

**Local setup:**

```bash
pnpm i
pnpm --filter @treasury-ops/shared build   # root lint/typecheck/test scripts assume this is already built

cp env.example .env
# set POSTGRES_PASSWORD in .env (e.g. `local-dev-password`, matching .env.development.local.example below)
cp .env.development.local.example .env.development.local   # host-native `pnpm dev` overrides: localhost
                                                             # ports instead of Docker service names, since
                                                             # .env itself stays Docker-Compose-shaped

docker compose --env-file .env up -d postgres   # local Postgres 18 only, published on localhost:5433
cd infra/redis && cp .env.example .env && docker compose up -d && cd ../..   # local Redis

pnpm migrate                  # drizzle-kit migrate — applies apps/api/drizzle/*.sql
pnpm --filter @treasury-ops/api seed # optional: seeds demo accounts/transactions for local login
pnpm dev                      # runs apps/api and apps/web dev servers in parallel
```

Env vars are validated at boot via zod (`apps/api/src/common/config/env.ts`) — a missing/invalid var fails startup immediately. See `env.example` for the full list and notes on LAN/TLS cookie behavior.

**Other useful commands** (run from repo root):

```bash
pnpm lint                     # eslint across all workspaces, zero warnings allowed
pnpm typecheck                # tsc --noEmit across all workspaces, zero errors
pnpm test                     # vitest unit tests across all workspaces
pnpm test:integration         # apps/api only — spins up a real Postgres via testcontainers, one container
                               # per test file (needs a working Docker daemon, but not the `postgres`
                               # compose service above — testcontainers manages its own)
pnpm build                    # builds @treasury-ops/shared, @treasury-ops/api, @treasury-ops/web
pnpm format / format:check    # prettier
pnpm verify:migrations        # sanity-checks migration ordering/state
pnpm gen:client                # regenerates apps/api/openapi.json + apps/web's typed API client
                               # from it — run after changing any API route's zod schemas
```

Single-package/single-test commands:

```bash
pnpm --filter @treasury-ops/api test -- path/to/file.test.ts
pnpm --filter @treasury-ops/api lint / typecheck / dev / build
pnpm --filter @treasury-ops/web lint / typecheck / dev / build
```

CI (`.github/workflows/ci.yml`) runs, in order: `lint` → `typecheck` → `test` → `test:integration` → `verify:migrations` → `build` → Trivy filesystem scan. Match this locally before pushing.

**Docker (production-style, full stack):**

```bash
docker compose --env-file .env build
docker compose --env-file .env run --rm migrate   # applies migrations, exits; gates everything else
docker compose --env-file .env up -d
```

Brings up `postgres` + `migrate` (one-shot) → `api` + `worker` → `web`, all behind an `nginx` reverse proxy (the only exposed container, `localhost:3006`). Postgres's port is bound to loopback by default (`localhost:5433`, not reachable from the LAN/internet) — see `POSTGRES_BIND_ADDR` in `env.example` if you need it reachable from another machine for local dev. See `docker-compose.yml` and `docs/DEPLOYMENT-TREASURY-OPS.md`.

## Current issues

Verified against the actual codebase (not just the design docs, which lag behind — `HANDOFF.md` in particular describes an earlier state than what's implemented):

- **No recurring-rules UI** — the backend module (`apps/api/src/recurring/`) is fully built, but `apps/web` has no matching `features/recurring` — the nightly materializer cron runs, but rules can only be created/managed via the API directly today.
- **No dependency pinning on tooling** — `typescript`, and several other devDependencies across the workspaces are pinned to `"latest"`/`"beta"`. A plain `pnpm i` can pull a broken prerelease (observed firsthand: it resolved Vite `8.1.4`, whose oxc transform has a tsconfig-resolution bug against this pnpm-symlinked monorepo layout, breaking all `apps/api` integration tests and one `apps/web` unit suite — a tooling failure, not a code bug. Pinning known-good versions would remove this risk for every future contributor).
- **Root `typecheck`/`lint`/`test` scripts assume `@treasury-ops/shared` is already built** — on a fresh clone, run `pnpm --filter @treasury-ops/shared build` once before those scripts will pass; only `pnpm dev`/`pnpm build` build it automatically.
- **No rate limiting on auth routes** — `IMPLEMENTATION-PLAN.md`'s Phase 1 gate calls for Redis-backed throttling (429 on repeated login attempts); no throttler is wired up in the code yet.

## TODO

- **Recurring-rules UI** — build `apps/web/src/features/recurring` against the already-built API
- **Rate limiting on auth routes** (Redis-backed throttler)
- **Salary/income module** (`SALARY-MODULE.md`) — profiles, effective-dated versions, materializer, payday/proration logic, reconciliation; entirely unbuilt
- **Observability** — OpenTelemetry, `/metrics`, `explain()` query-budget CI check
- **Auth hardening** — passkeys, 2FA
- **Pin volatile dev dependencies** (`typescript`, etc.) instead of `"latest"`/`"beta"`, to keep fresh installs reproducible

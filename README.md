# Vyaya

A personal expense tracker built as an **append-only, double-entry-style ledger**, where correctness of money math is the product — inspired by [Firefly III](https://www.firefly-iii.org/). Work in progress.

pnpm workspace monorepo:

```
apps/api          NestJS REST API — Better Auth, MongoDB (Mongoose), BullMQ workers, crons
apps/web           Next.js App Router frontend (SSR, server components)
packages/shared    zod schemas + types shared by both apps (single source of truth)
packages/config     shared tsconfig
migrations/        migrate-mongo files (ordered, additive-only)
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
- **Health checks** — `/healthz` (liveness), `/readyz` (Mongo/Redis ping)

Every money write is atomic (single MongoDB transaction: insert + balance update + audit entry), and all amounts are stored as integer paise — never floats.

**Frontend (`apps/web`) — early scaffolding, not wired up yet:**

- Login page (working, via Better Auth client SDK)
- `transactions`, `reports`, `add`, `more` routes exist but currently render `<ComingSoon>` placeholders — no data fetching, no API client, not connected to the backend above yet

## Installing and running

**Prerequisites:**

- Node `24.18.x` (see `.nvmrc`)
- pnpm `10.28.1`
- MongoDB, running as a **replica set** (required for multi-document transactions)
- Redis (for BullMQ)

**Local setup:**

```bash
pnpm i                        # install all workspace deps
cp env.example .env           # fill in MongoDB URI, Redis URL, Better Auth secret, etc.
pnpm migrate                  # run migrate-mongo migrations
pnpm dev                      # runs apps/api and apps/web dev servers in parallel
```

Env vars are validated at boot via zod (`apps/api/src/common/config/env.ts`) — a missing/invalid var fails startup immediately. See `env.example` for the full list and notes on LAN/TLS cookie behavior.

**Other useful commands** (run from repo root):

```bash
pnpm lint                     # eslint across all workspaces, zero warnings allowed
pnpm typecheck                # tsc --noEmit across all workspaces, zero errors
pnpm test                     # vitest unit tests across all workspaces
pnpm test:integration         # apps/api only, spins up MongoDB in replica-set mode
pnpm build                    # builds @vyaya/shared, @vyaya/api, @vyaya/web
pnpm format                   # prettier --write
pnpm verify:migrations        # sanity-checks migration ordering/state
```

Single-package/single-test commands:

```bash
pnpm --filter @vyaya/api test -- path/to/file.test.ts
pnpm --filter @vyaya/api lint / typecheck / dev / build
pnpm --filter @vyaya/web lint / typecheck / dev / build
```

CI (`.github/workflows/ci.yml`) runs, in order: `lint` → `typecheck` → `test` → `test:integration` → `verify:migrations` → `build` → Trivy filesystem scan. Match this locally before pushing.

**Docker (production-style):**

```bash
docker compose up
```

Runs `migrate` (one-shot, gates everything else) → `api` + `worker` → `web`, all behind an `nginx` reverse proxy (the only exposed container). See `docker-compose.yml` and `DEPLOYMENT-VYAYA.md`.

## Current issues

Verified against the actual codebase (not just the design docs, which lag behind — `HANDOFF.md` in particular describes an earlier state than what's implemented):

- **Frontend isn't wired to the backend** — this is the biggest gap. The API supports transactions, imports, recurring rules, reports, etc., but the corresponding frontend routes are `<ComingSoon>` stubs with no data fetching and no API client.
- **No dependency pinning on tooling** — `vitest`, `typescript`, and several other devDependencies are pinned to `"latest"`/`"beta"`. A plain `pnpm i` can pull a broken prerelease (observed firsthand: it resolved Vite `8.1.4`, whose oxc transform has a tsconfig-resolution bug against this pnpm-symlinked monorepo layout, breaking all `apps/api` integration tests and one `apps/web` unit suite — a tooling failure, not a code bug. Pinning known-good versions would remove this risk for every future contributor).
- **Root `typecheck`/`lint`/`test` scripts assume `@vyaya/shared` is already built** — on a fresh clone, run `pnpm --filter @vyaya/shared build` once before those scripts will pass; only `pnpm dev`/`pnpm build` build it automatically.
- **No rate limiting on auth routes** — `IMPLEMENTATION-PLAN.md`'s Phase 1 gate calls for Redis-backed throttling (429 on repeated login attempts); no throttler is wired up in the code yet.
- **No OpenAPI spec / generated API client** — `pnpm gen:client` referenced in `AGENTS.md` isn't wired up; not blocking yet only because the frontend isn't consuming the API at all currently.

## TODO

- **Wire the frontend to the backend** — replace the `<ComingSoon>` stubs (`transactions`, `reports`, `add`, `more`) with real data fetching against the already-built API
- **Rate limiting on auth routes** (Redis-backed throttler)
- **OpenAPI spec + generated frontend client**, replacing ad-hoc fetch calls once the frontend starts consuming the API
- **Salary/income module** (`SALARY-MODULE.md`) — profiles, effective-dated versions, materializer, payday/proration logic, reconciliation; entirely unbuilt
- **Observability** — OpenTelemetry, `/metrics`, `explain()` query-budget CI check
- **Auth hardening** — passkeys, 2FA
- **Pin volatile dev dependencies** (`vitest`, `typescript`, etc.) instead of `"latest"`/`"beta"`, to keep fresh installs reproducible

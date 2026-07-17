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

Implemented today:

- **Auth** — Better Auth (email/password), session cookies, `AuthGuard` + `@CurrentUser()`, per-user data isolation
- **Accounts & categories** — CRUD, archive-not-delete
- **Transactions** — create (expense/income), cursor-paginated list with filters (`accountId`, `categoryId`, date range, description search), non-monetary edits (description/tags/category), reversal via compensating entries
- **Transfers** — atomic two-leg transfers between accounts, group-level reversal
- **Idempotency** — `Idempotency-Key` header support on money-writing endpoints; duplicate requests replay the original result instead of double-posting
- **Net-worth assets** — loans given/taken, fixed deposits, gold/silver, manually valued investments; append-only valuation history
- **Standardized API errors** — RFC 7807 problem+json, typed error codes, per-field validation errors
- **Health checks** — `/healthz` (liveness), `/readyz` (Mongo/Redis ping)

Every money write is atomic (single MongoDB transaction: insert + balance update + audit entry), and all amounts are stored as integer paise — never floats.

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

These are deliberate, flagged simplifications rather than bugs — see `HANDOFF.md` for full detail:

- **Inconsistent error architecture** — only `transactions`/`transfers`/`assets` throw typed `DomainError`s; `accounts`, `categories`, `user-profiles`, `health`, and `auth` still throw raw NestJS exceptions. They map correctly through the fallback handler, but it's a bridge, not the target architecture.
- **`txn.already_reversed` is overloaded** — used for three distinct cases (not found, already reversed, is itself a reversal) that should be split into separate error codes/statuses.
- **No `Idempotency-Key` on asset/valuation writes** — acceptable for now since these are low-frequency manual entries, unlike ledger transactions.
- **No OpenAPI spec / generated client** — the frontend has no typed API client yet; `pnpm gen:client` referenced in `AGENTS.md` is not wired up.
- **BullMQ isn't processing real jobs yet** — `worker.ts` is currently just a Redis heartbeat.
- **`common/time/` is empty** — the designated home for `Asia/Kolkata` date utilities; several planned features (imports, recurring, salary) depend on it.
- **No rate limiting beyond auth routes**, no `Retry-After` computation on 503s.

## TODO

Unstarted, full-effort work (see `IMPLEMENTATION-PLAN.md` and `BACKEND.md` for detail):

- **CSV import pipeline** — upload, BullMQ parsing job, staged-row preview, chunked resumable commit, batch revert, bank-specific (HDFC/ICICI) column-mapping presets, dedupe hashing, rule-based category suggestions
- **Recurring transactions, budgets, reports, scheduler, notifications modules** — none of these exist yet
- **Salary/income module** (`SALARY-MODULE.md`) — profiles, effective-dated versions, materializer, payday/proration logic, reconciliation
- **Observability** — OpenTelemetry, `/metrics`, outbox pattern for notifications, circuit breaker on outbound calls
- **Auth hardening** — passkeys, 2FA
- **Retrofit remaining services** (`accounts`, `categories`, `user-profiles`, `health`) to throw `DomainError` subclasses
- **OpenAPI spec + generated frontend client**, replacing hand-written fetch calls

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the `apps/api` package of the TreasuryOps monorepo — read the root `/CLAUDE.md` and `/AGENTS.md` first; those rules (money handling, TypeScript strictness, testing gates, architecture boundaries) apply here and are not repeated below. This file covers only what's specific to the NestJS backend.

**Note:** the root `CLAUDE.md`'s "Current implementation state" section describes this package as foundation-only (auth/config/db/health). That's stale — `src/` now has a full set of domain modules: `accounts`, `api-keys`, `assets`, `audit`, `balances`, `bills`, `budgets`, `categories`, `category-rules`, `dashboard`, `export`, `financial-profiles`, `goals`, `imports`, `notifications`, `openapi`, `recurring`, `reports`, `spending-warnings`, `transactions`, `user-profiles`. Trust what you find under `src/`, not that summary. `docs/backend/BACKEND.md` (not root `BACKEND.md` — that path in the root doc is wrong) is the target design doc; still treat it as intent, not a guaranteed description of current code.

## Commands

Run from this directory, or via `pnpm --filter @treasury-ops/api <script>` from the repo root.

```bash
pnpm dev                      # tsc --watch + node --watch, needs ../../packages/shared built first
pnpm build                    # tsc -p tsconfig.json
pnpm lint                     # eslint against shared root config, --max-warnings=0
pnpm typecheck                 # tsc --noEmit -p tsconfig.test.json (includes test/ in the check)
pnpm test                     # vitest run --passWithNoTests (unit tests, colocated __tests__/)
pnpm test:integration          # vitest against vitest.integration.config.ts — real Postgres via testcontainers
pnpm test:e2e                  # vitest against vitest.e2e.config.ts — full HTTP app + Postgres + Redis containers
pnpm migrate:generate          # drizzle-kit generate — new migration from schema changes in src/common/db/schema/
pnpm migrate                  # drizzle-kit migrate — applies apps/api/drizzle/*.sql
pnpm migrate:status            # drizzle-kit check
pnpm gen:openapi               # tsx scripts/generate-openapi.ts — regenerates openapi.json (usually invoked via root `pnpm gen:client`)
pnpm seed                     # tsx scripts/seed.ts — demo accounts/transactions against DATABASE_URL
pnpm check:circular             # madge --circular — no circular imports in src/
```

Single test file: `pnpm --filter @treasury-ops/api test -- src/transactions/transaction.service.test.ts`, or `test:integration -- test/integration/transactions/transaction.repository.integration.ts`.

## Architecture

### Module layout

Each domain module under `src/<module>/` follows the controller → service → repository layering from `AGENTS.md` §4: `*.controller.ts` (HTTP/zod parsing only) → `*.service.ts` (business rules, calls `withTxn`) → `*.repository.ts` (only place touching Drizzle, every method takes `userId` first). Some modules split further where money-mutation logic is large enough to separate from read/query logic — e.g. `transactions/` has both `transaction.service.ts` and `transaction-mutation.service.ts`, plus a distinct `transfer.controller.ts`/`transfer.service.ts` pair for two-leg transfers. Follow whatever split an existing sibling module already uses rather than inventing a new shape.

Cross-module calls go through Nest DI (inject the other module's exported service) — never deep-import another module's repository or internal files. `app.module.ts` wires all feature modules together for the HTTP process; `worker.ts` is a separate entrypoint that boots only the modules needed for BullMQ job processing (see `worker-health.ts` for its liveness check).

### Database

- Schema lives in `src/common/db/schema/*.ts` (one file per table, barrel `index.ts`), plus `auth-schema.ts` for Better Auth's own tables. Never edit `apps/api/drizzle/*.sql` migrations by hand after generation — `pnpm migrate:generate` produces them from schema changes.
- `common/db/db-txn.ts` — the `withTxn` helper (read-committed isolation, retries on `40001`/`40P01`). Every money-writing service method wraps its repository calls in this; see its top-of-file comment for why read-committed (not repeatable-read) is deliberate.
- `common/db/database-client.service.ts` / `db.module.ts` — Drizzle client wiring, exported via the `DATABASE_CONNECTION` injection token.
- `common/db/strip-nulls.ts` / `postgres-error.ts` — row-shaping and Postgres error-code helpers used across repositories.

### Errors

`common/errors/domain-error.ts` is the abstract base (`code`, `status`, `retryable`); every specific failure (e.g. `bill-already-reconciled.error.ts`, `category-hierarchy-conflict.error.ts`, `insufficient-scope.error.ts`) is its own file extending it. `common/errors/problem-json.filter.ts` is the global Nest exception filter that turns any thrown `DomainError` into an RFC 7807 problem+json response — controllers and services throw the typed error class, never `throw new Error(...)` or a raw `HttpException`. Adding a new failure mode means adding a new `*.error.ts` file here, not overloading an existing one.

### Auth

`auth/auth.guard.ts` + `auth/current-user.decorator.ts` are the only sanctioned way to get the authenticated user in a controller (`@CurrentUser()`); `auth/public.decorator.ts` opts a route out of the guard, `auth/require-scopes.decorator.ts` gates API-key-scoped routes. `auth/redis-secondary-storage.ts` backs Better Auth's session store with Redis. Don't read cookies or session state manually outside this module.

### Idempotency, scheduling, and background work

- `common/idempotency/` — Postgres-backed idempotency key store (`idempotency-postgres.repository.ts`/`.service.ts`); mutating endpoints check/record here per `AGENTS.md` §3.5.
- `common/scheduler/` — cron coordination: `scheduled-run.coordinator.ts` claims a run, `scheduled-run.watchdog.ts` detects stuck/crashed runs, `scheduled-run.repository.ts` persists run state. Use this rather than a bare `@Cron()` decorator when a job must not double-run across replicas.
- `common/queue/` — BullMQ connection (`queue-connection.ts`) and retry/backoff policy (`queue-policy.ts`) shared by all job producers/consumers; `worker.ts` is where consumers actually register.
- `notifications/` — outbox pattern; writes land in the `notification_outbox` table inside the triggering transaction (never call ntfy/Telegram directly from a service), a worker job drains it. `notifications/circuit-breaker.ts` protects outbound delivery calls.

### Other common/ utilities

- `common/time/ist.ts` / `parse-date.ts` — all calendar math (cron dates, "today", month rollups) goes through these `Asia/Kolkata` helpers, never raw `Date` getters.
- `common/pagination/cursor.ts` — JSON + UTF-8 + base64url codec for opaque list cursors. Repositories keep their own payload schemas so existing client-held cursors still decode; do not invent a second encoding.
- `common/csv/parse-amount.ts` / `parse-csv-row.ts` — shared parsing used by `imports/`.
- `common/logging/` — pino wiring; `request-context.middleware.ts` attaches a request-scoped child logger, `transaction-observer.service.ts` logs money-write outcomes, `events.ts` is the catalog of structured log event names. Use the injected logger, never bare `console.log` (enforced, see `AGENTS.md` §7).
- `common/observability/` — `/metrics` endpoint and HTTP metrics middleware.
- `common/throttler/redis-throttler.storage.ts` — Redis-backed rate limiting storage for Nest's throttler module.
- `common/process/deadline.ts` — shared timeout/deadline helper for bounding long-running operations outside a DB transaction.

### OpenAPI

`openapi/` generates the spec consumed by `pnpm gen:client` (root script) from the same zod schemas in `packages/shared` used for request/response validation — this is why DTOs are never hand-written per `AGENTS.md` §5. `scripts/generate-openapi.ts` is the entrypoint; regenerate (`pnpm gen:openapi` or root `pnpm gen:client`) whenever a route's schema changes, since CI diffs the spec for breaking changes.

## Testing conventions

- **Unit tests** — colocated in each module's `__tests__/` directory (e.g. `transactions/__tests__/`), run by plain `pnpm test` (vitest, no containers). `test/mock-drizzle.ts` / `test/mock-config.ts` provide shared fakes.
- **Integration tests** — `test/integration/<module>/*.integration.ts`, one per module mirroring `src/`, run against a real Postgres spun up per test file via testcontainers (`test/integration/support/postgres-test-db.ts`). `test/repository-tenancy-contract.test.ts` and `test/repository-edge.coverage.test.ts` are cross-cutting contract tests, not tied to one module — check these when adding or changing a repository method's signature. Integration/e2e assertions end with `assertLedgerInvariants()` (`test/integration/support/assert-ledger-invariants.ts`) per `AGENTS.md` §7.
- **E2E** — a single `test/e2e/http-api.e2e.ts` boots the real `createHttpApp()` (from `src/http-app.ts`) against testcontainer Postgres + Redis and drives it over real HTTP, including registering two separate users to assert cross-tenant isolation (404, not leaked data) on the routes it covers. When adding a new authenticated route, extend this file's coverage rather than assuming an unrelated generator does it for you.
- `pnpm --filter @treasury-ops/api lint` also lints `scripts/seed.ts` and `scripts/seed/` — keep those passing, not just `src/`.

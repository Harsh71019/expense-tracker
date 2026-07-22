# AGENTS.md — TreasuryOps Expense Tracker

Instructions for AI coding agents (and humans) working in this repo. These rules are **non-negotiable**. If a task conflicts with a rule here, stop and ask instead of working around it.

---

## 1. What This Project Is

Personal expense tracker with an **append-only, double-entry-style ledger**. Correctness of money math is the product. Monorepo:

```
apps/api        NestJS (REST API, Better Auth, BullMQ workers, crons)
apps/web        Next.js App Router (SSR frontend)
packages/shared zod schemas + types shared by both (single source of truth)
packages/config shared tsconfig/eslint
deploy/         nginx.conf, backup.sh (Proxmox LXC deployment)
apps/api/drizzle/  drizzle-kit migrations (ordered, additive-only)
```

Runtime: Node 24.18 LTS, pnpm workspaces, PostgreSQL 18 (Drizzle ORM), Redis (BullMQ). Deployed via `deploy.sh` on a home LXC; port 3006 behind nginx.

---

## 2. TypeScript — Strict, Zero Errors, No Escape Hatches

- `"strict": true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`. Do not weaken any tsconfig option, ever.
- **`pnpm typecheck` must pass with zero errors before you consider any task done.** A task that "works" but has type errors is a failed task.
- Banned (ESLint enforces; do not disable rules to get around it):
  - `any` (explicit or implicit) — use `unknown` + narrowing, or write the real type
  - `as` casts except `as const` and casting `unknown` after a runtime check
  - `@ts-ignore` / `@ts-expect-error` (the latter only in tests, with a comment explaining why)
  - `!` non-null assertions — handle the null path or restructure
  - `enum` — use `as const` object + union type
- All exported functions have explicit return types. No inferred `any` leaks across module boundaries.
- Types are derived, not duplicated: `type Txn = z.infer<typeof TxnSchema>` from `packages/shared`. Never hand-write a type that a zod schema already defines. Never define the same shape twice in api and web.
- Runtime boundaries (HTTP bodies, env vars, CSV rows, queue payloads, database rows leaving the repository layer) are **parsed with zod, not asserted**. `JSON.parse` result is `unknown` until validated.

## 3. Money Rules (violating these corrupts the ledger)

1. **All amounts are integer paise** (`amountMinor: number`, always a positive integer; sign derives from `type`). Floats never touch money. No arithmetic on display strings. Use `packages/shared/money.ts` utils only.
2. **The ledger is append-only.** Never write code that updates monetary fields (`amountMinor`, `type`, `accountId`, `occurredAt`) or deletes a transaction document. Corrections are compensating reversal entries via `ReversalService`. If a task asks you to "edit an amount", implement reverse + repost.
3. **Every money write goes through `withTxn`** (Postgres transaction, `read committed` isolation — the Postgres default, deliberately not `repeatable read`; see `common/db/db-txn.ts`'s comment for why — with automatic retry on `40001`/`40P01` serialization/deadlock errors). Insert + account balance update + audit entry are one transaction or nothing. No business code opens a transaction outside `withTxn`.
4. **Nothing slow inside a transaction**: no HTTP calls, no file I/O, no CSV parsing inside a transaction. Parse first, transact last. Batch writes in chunks of ≤200 rows per transaction.
5. **Every mutating endpoint is idempotent** (`Idempotency-Key` header → unique sparse index → duplicate returns the original result). Cron-generated writes use deterministic keys (`ruleId + IST calendar date`).
6. `balanceMinor` on accounts is a derived cache. Any new write path must update it in the same transaction, or the Sunday `balances.verify` job will page us — that alert firing means your code is wrong, not the job.

## 4. Architecture Boundaries

- **Controllers**: HTTP only — parse/validate (zod pipe), call one service method, map result. No Drizzle, no business logic.
- **Services**: business rules and transaction orchestration. No `req`/`res` types, no HTTP status decisions.
- **Repositories**: the only layer that touches Drizzle. **Every repository method takes `userId` as a required first parameter and includes it in every filter.** No exceptions, including "it's single-user anyway". Handlers never read `userId` from a request body — only from the session (`@CurrentUser()`).
- Module dependencies flow one way: `transactions` may not import from `imports`; shared logic goes to `common/`. If you need a cross-module call, inject the other module's service via Nest DI — never deep-import its internals.
- Long-running work (CSV parse, report generation, notifications) goes to BullMQ jobs, never the request cycle. Jobs must be safe to retry (idempotent) and safe to kill (resumable) — assume every job will crash midway at least once.
- Notifications are written to the `notification_outbox` table **inside the triggering transaction**, drained by a worker. Never call ntfy/Telegram directly from a service.
- New tables, columns, or indexes go in a **drizzle-kit migration** (`pnpm migrate:generate`, then commit the generated SQL under `apps/api/drizzle/`), never in application code, never applied by hand against prod. Migrations are additive-only (no drops, no renames of live columns) — rollback safety depends on this.

## 5. API Conventions

- All routes under `/api/v1/` (Better Auth owns `/api/auth/*`). Errors are RFC 7807 problem+json via the global filter — never `throw new Error` from a controller path; use the domain error classes in `common/errors`.
- List endpoints use cursor pagination (`occurredAt + _id`), never offset. Default limit 50, max 200.
- Request/response DTOs come from `packages/shared` zod schemas; `@nestjs/swagger` spec is generated from them. If you change a schema, regenerate the web client (`pnpm gen:client`) — CI runs `oasdiff` and fails on breaking changes.
- Dates over the wire are ISO 8601 UTC. All calendar logic (rollup months, cron dates, "today") is computed in `Asia/Kolkata` via the date utils in `common/time.ts` — never `new Date().getMonth()` raw.

## 6. Frontend (apps/web)

- App Router, server components by default; `"use client"` only where interaction requires it.
- Data access only through the generated typed API client — no hand-written `fetch` to the API, no direct DB access from Next.js.
- Mutation forms generate an idempotency UUID on mount (commute connections double-submit; this is load-bearing, don't remove it).
- Money is displayed via `formatMinor()` from shared — never divide by 100 inline.
- Tailwind only; no new UI dependencies without asking.

## 7. Testing — Definition of Done

A change is done when **all** of these pass locally: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` (and `pnpm test:e2e` if you touched routes/auth).

- New business logic ships with tests in the same PR. Money-path code (`transactions/`, `imports/`, `common/money`, `common/db/db-txn.ts`) has a **90% line coverage gate** — CI blocks below it.
- Integration tests run against a **testcontainers Postgres instance**, migrated fresh per test file (transactions must be real). Every integration/e2e test ends with `assertInvariants()` (conservation, append-only, pairing).
- If you write concurrency-sensitive code (idempotency, reversal guards, import commit), add a parallel-execution test (`Promise.all` of ≥5 identical attempts → exactly one effect).
- If you add an authenticated route, the auto-generated tenancy probe suite must cover it — check it appears in the OpenAPI spec, that's what the probe generator reads.
- Never fix a failing test by deleting it, loosening its assertion, or adding retries. If it's genuinely flaky, move it to `flaky/` and open an issue.
- No `console.log` in committed code — pino logger with the request-scoped child (`this.logger`) only.

## 8. Security Rules

- Secrets come from validated env (`config/env.ts` zod schema). Never hardcode, never log, never commit. Adding a new env var = update the zod schema + `.env.example` in the same PR, or boot will fail-fast in prod.
- Session comes from Better Auth via `AuthGuard` — do not build parallel auth, do not read cookies manually, do not mint JWTs.
- File uploads: respect the existing caps (5MB, 50k rows, MIME check). CSV **export** must keep formula-injection neutralization (`'` prefix on `=+-@` cells).
- SQL is built exclusively through Drizzle's query builder and parameterized `sql` template literals — never string-concatenate a raw query param into a query (SQL injection).
- Audit log is write-once. No code path may update or delete `audit_log` rows.

## 9. Workflow & Hygiene

- Conventional commits (`feat(imports): resumable chunk commit`). One logical change per commit; keep diffs reviewable.
- Do not add dependencies casually. Anything new must justify itself against what's already here (lodash-style utils → write the 5 lines instead). Never add a dependency to work around a type error.
- Do not touch `deploy/`, `deploy.sh`, `docker-compose.yml`, or `apps/api/drizzle/` in the same PR as feature code unless the feature requires it — deployment changes are reviewed separately.
- Update docs in the same PR when behavior changes: `BACKEND.md` for architecture, `DEPLOYMENT-TREASURY-OPS.md` for ops, this file for conventions.
- When uncertain between "clever" and "boring", choose boring. This codebase optimizes for being obvious at 11pm after a Vikhroli commute.

## 10. Quick Commands

```bash
pnpm i                       # install (workspace root)
pnpm dev                     # api :4000 + web :3000 + worker (local Postgres via docker-compose)
pnpm lint / typecheck        # zero warnings, zero errors — both are gates
pnpm test                    # unit (vitest)
pnpm test:integration        # testcontainers Postgres integration suite
pnpm test:e2e                # testcontainers e2e
pnpm gen:client              # regenerate typed API client after schema changes
pnpm migrate:generate        # new migration file from schema changes
```

**The one-line summary:** integer paise, append-only, everything in a transaction, every query scoped by userId, zod at every boundary, zero type errors — and if a rule blocks you, ask, don't bypass.

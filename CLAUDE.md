# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required reading

**Read `AGENTS.md` in full before making changes.** It contains non-negotiable rules for this repo (TypeScript strictness, money-handling invariants, architecture boundaries, testing gates, security rules). This file only adds commands and orientation; `AGENTS.md` is the source of truth for _how_ to write code here, and its rules override any default behavior.

`BACKEND.md` is the target architecture design doc (full data model, API surface, cron jobs, deployment topology) — useful for understanding where a feature is headed, but treat it as a plan, not a description of what's implemented today (see "Current state" below).

## What this project is

**Vyaya** — a personal expense tracker built as an append-only, double-entry-style ledger, where correctness of money math is the product. pnpm workspace monorepo:

```
apps/api          NestJS REST API — Better Auth, MongoDB (Mongoose), BullMQ workers, crons
apps/web           Next.js App Router frontend (SSR, server components)
packages/shared    zod schemas + types shared by both apps (single source of truth)
packages/config     shared tsconfig
migrations/        migrate-mongo files (ordered, additive-only — indexes/validators live here, never in app code)
infra/redis/        local Redis compose service
```

Runtime: Node 24.18.x, pnpm workspaces, MongoDB (replica set — required for multi-document transactions), Redis (BullMQ). Deployed via `deploy.sh` to a home-lab Proxmox LXC behind nginx.

## Commands

Run from the repo root unless noted.

```bash
pnpm i                       # install all workspace deps
pnpm dev                     # runs apps/api and apps/web dev servers in parallel
pnpm lint                    # eslint across all workspaces, zero warnings allowed (--max-warnings=0)
pnpm typecheck                # tsc --noEmit across all workspaces, zero errors
pnpm test                    # vitest unit tests across all workspaces
pnpm test:integration        # apps/api only — vitest against vitest.integration.config.ts
pnpm build                   # builds @vyaya/api then @vyaya/web
pnpm format / format:check   # prettier
pnpm migrate                 # migrate-mongo up, via apps/api, using migrate-mongo-config.cjs
pnpm verify:migrations       # scripts/verify-migrations.ts
```

Single-package/single-test commands:

```bash
pnpm --filter @vyaya/api test -- path/to/file.test.ts     # single unit test file (vitest)
pnpm --filter @vyaya/api test:integration -- path/to/file.integration.ts
pnpm --filter @vyaya/api lint / typecheck / dev / build
pnpm --filter @vyaya/web lint / typecheck / dev / build
```

Notes:

- `pnpm test:integration` spins up MongoDB in **replica-set mode** (via `mongodb-memory-server`) because multi-document transactions must be exercised for real — see `MONGODB_URI` handling in CI (`.github/workflows/ci.yml`) and `vitest.integration.config.ts`.
- CI runs, in order: `lint` → `typecheck` → `test` → `test:integration` → `verify:migrations` → `build` → Trivy filesystem scan. Match this locally before pushing.
- `AGENTS.md` references `pnpm test:e2e` and `pnpm gen:client` as part of the definition of done — these are not yet wired up as root scripts. If a task needs them, add the script rather than assuming it exists silently.
- Env vars are validated at boot via zod (`apps/api/src/common/config/env.ts`); see `env.example` for the full list and comments on LAN/TLS cookie behavior. A missing/invalid var fails startup immediately, not at first use.

## Current implementation state vs. design doc

`BACKEND.md` describes the full target system (transactions, imports, budgets, recurring rules, reports, cron jobs, notifications). **As of now the codebase is at the foundation stage** — only this exists under `apps/api/src`:

- `auth/` — Better Auth integration, `AuthGuard`, `@CurrentUser()` decorator
- `common/config/` — zod-validated runtime env (`RuntimeEnvSchema`), `RuntimeConfigModule`/`Service`
- `common/redis/` — Redis module/service (BullMQ backing)
- `common/errors/` — domain error base class + RFC 7807 problem+json exception filter
- `common/mongo-txn/`, `common/time/` — directories exist but are currently empty; these are the designated homes for the `withTxn` helper and `Asia/Kolkata` date utilities described in `AGENTS.md` §3/§4 — implement there, don't scatter equivalents elsewhere
- `health/` — `/healthz` liveness endpoint
- `worker.ts` / `worker-health.ts` — separate BullMQ worker process entrypoint

`packages/shared/src` currently only has `money.ts` (paise-based money utilities) and `index.ts`. None of the domain modules (`accounts`, `transactions`, `imports`, `recurring`, `budgets`, `reports`, `scheduler`, `notifications`) described in `BACKEND.md` §8 exist yet. When building one of these, follow the module layout and layering rules in `BACKEND.md` §8 and `AGENTS.md` §4 (controller → service → repository, `userId` required on every repository method) rather than improvising a different shape.

`apps/web` is similarly minimal: `app/layout.tsx`, `app/page.tsx`, `app/login/page.tsx`, and `src/auth-client.ts` (Better Auth client SDK wiring). No data-fetching or typed API client exists yet — when adding one, it must be generated from the OpenAPI spec (`pnpm gen:client`, once wired up) per `AGENTS.md` §6, not hand-written `fetch` calls.

## The essentials (see AGENTS.md for full detail)

- **Money is always integer paise** (`amountMinor`), never floats; use `packages/shared/money.ts`.
- **The ledger is append-only** — no updates/deletes of monetary fields or transaction docs; corrections are compensating reversal entries.
- **Every money write is one MongoDB transaction** (insert + balance `$inc` + audit entry), via a `withTxn` helper — never call `startSession` directly in business code.
- **Every repository method takes `userId` as a required first parameter.** `userId` comes only from the session (`@CurrentUser()`), never from a request body.
- **No `any`, no `as` casts (except `as const`), no `!`, no `enum`, no `@ts-ignore`.** `pnpm typecheck` must be clean.
- New indexes/validators/collections go through a `migrate-mongo` migration in `migrations/`, never applied by hand or from application code.

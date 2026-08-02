# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required reading

**Read `AGENTS.md` in full before making changes.** It contains non-negotiable rules for this repo (TypeScript strictness, money-handling invariants, architecture boundaries, testing gates, security rules). This file only adds commands and orientation; `AGENTS.md` is the source of truth for _how_ to write code here, and its rules override any default behavior.

`docs/backend/BACKEND.md` is the target architecture design doc (full data model, API surface, cron jobs, deployment topology) — useful for understanding where a feature is headed, but treat it as a plan, not a description of what's implemented today (see "Current state" below). `apps/api/CLAUDE.md` and `apps/web/CLAUDE.md` have package-specific orientation (module layout, testing conventions) and take precedence over this file for anything specific to their package.

## What this project is

**TreasuryOps** — a personal expense tracker built as an append-only, double-entry-style ledger, where correctness of money math is the product. pnpm workspace monorepo:

```
apps/api          NestJS REST API — Better Auth, PostgreSQL (Drizzle ORM), BullMQ workers, crons
apps/web           Next.js App Router frontend (SSR, server components)
packages/shared    zod schemas + types shared by both apps (single source of truth)
packages/config     shared tsconfig
apps/api/drizzle/  drizzle-kit migrations (ordered, additive-only — schema changes live here, never applied by hand)
infra/redis/        local Redis compose service
```

Runtime: Node 24.18.x, pnpm workspaces, PostgreSQL 18 (Drizzle ORM), Redis (BullMQ). Deployed via `deploy.sh` to a home-lab Proxmox LXC behind nginx.

## Commands

Run from the repo root unless noted.

```bash
pnpm i                       # install all workspace deps
pnpm dev                     # runs apps/api and apps/web dev servers in parallel
pnpm lint                    # eslint across all workspaces, zero warnings allowed (--max-warnings=0)
pnpm typecheck                # tsc --noEmit across all workspaces, zero errors
pnpm test                    # vitest unit tests across all workspaces
pnpm test:integration        # apps/api only — vitest against vitest.integration.config.ts
pnpm test:e2e                # apps/api only — vitest against vitest.e2e.config.ts, full HTTP app + Postgres + Redis containers
pnpm build                   # builds @treasury-ops/shared, then @treasury-ops/api and @treasury-ops/web
pnpm format / format:check   # prettier
pnpm migrate                 # drizzle-kit migrate, via apps/api
pnpm verify:migrations       # scripts/verify-migrations.ts
pnpm gen:client               # regenerates apps/api/openapi.json + apps/web's typed API client
pnpm --filter @treasury-ops/api seed # seeds demo accounts/transactions against DATABASE_URL
```

Single-package/single-test commands:

```bash
pnpm --filter @treasury-ops/api test -- path/to/file.test.ts     # single unit test file (vitest)
pnpm --filter @treasury-ops/api test:integration -- path/to/file.integration.ts
pnpm --filter @treasury-ops/api lint / typecheck / dev / build
pnpm --filter @treasury-ops/web lint / typecheck / dev / build
```

Notes:

- `pnpm test:integration` spins up a real **Postgres instance via testcontainers** (one container per test file, migrated fresh) because transactions must be exercised for real — see `vitest.integration.config.ts` and `apps/api/test/integration/support/postgres-test-db.ts`.
- CI runs, in order: `lint` → `typecheck` → `test` → `test:integration` → `test:e2e` → `verify:migrations` → `build` → Trivy filesystem scan. Match this locally before pushing.
- Env vars are validated at boot via zod (`apps/api/src/common/config/env.ts`); see `env.example` for the full list and comments on LAN/TLS cookie behavior. A missing/invalid var fails startup immediately, not at first use.

## Current implementation state vs. design doc

`docs/backend/BACKEND.md` describes the full target system. The codebase has moved well past the foundation stage — treat both `docs/backend/BACKEND.md` and this section as directional, and trust what's actually under `src/` over either.

- `apps/api/src` has a full set of domain modules (`accounts`, `api-keys`, `assets`, `audit`, `balances`, `bills`, `budgets`, `categories`, `category-rules`, `dashboard`, `export`, `goals`, `imports`, `notifications`, `openapi`, `recurring`, `reports`, `spending-warnings`, `transactions`, `user-profiles`) on top of the original foundation (`auth/`, `common/`, `health/`, `worker.ts`). See `apps/api/CLAUDE.md` for the layering conventions (controller → service → repository) and module-by-module orientation.
- `packages/shared/src` has a zod schema + type per domain (`account.ts`, `transaction.ts`, `budget.ts`, `goal.ts`, `import.ts`, etc.) alongside `money.ts` — this is the single source of truth for DTOs on both sides of the API per `AGENTS.md` §2.
- `apps/web` has a full feature-sliced structure under `src/features/*` (accounts, transactions, transfers, categories, category rules, assets/net worth, imports, export, quick-add, reports, budgets, goals, bills, recurring, spending-warnings, profile, api-keys) wired to a generated typed API client (`pnpm gen:client`, now a working root script). See `apps/web/CLAUDE.md` for the client/server data-flow split and other frontend-specific conventions.

When building or extending a domain module, follow the module layout and layering rules in `docs/backend/BACKEND.md` §8 and `AGENTS.md` §4 (controller → service → repository, `userId` required on every repository method) and match the shape of an existing sibling module rather than improvising a new one.

## The essentials (see AGENTS.md for full detail)

- **Money is always integer paise** (`amountMinor`), never floats; use `packages/shared/money.ts`.
- **The ledger is append-only** — no updates/deletes of monetary fields or transaction docs; corrections are compensating reversal entries.
- **Every money write is one Postgres transaction** (insert + balance update + audit entry), via a `withTxn` helper — never open a transaction directly in business code.
- **Every repository method takes `userId` as a required first parameter.** `userId` comes only from the session (`@CurrentUser()`), never from a request body.
- **No `any`, no `as` casts (except `as const`), no `!`, no `enum`, no `@ts-ignore`.** `pnpm typecheck` must be clean.
- New tables/columns/indexes go through a `drizzle-kit` migration in `apps/api/drizzle/`, never applied by hand or from application code.

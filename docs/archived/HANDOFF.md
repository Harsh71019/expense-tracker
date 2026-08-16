# Handoff — Ledger Core (Phase 2) Completion

> Written 2026-07-16 after a session that closed out `IMPLEMENTATION-PLAN.md` Phase 2
> (ledger core). Read this before continuing backend work — it says what's done, what's
> deliberately simplified, and what's still open, so the next session doesn't re-derive
> any of it from scratch.

## Where things stand

Committed at `a817160` (`feat(ledger): add transaction list/edit, transfers, net-worth
assets, and API error-shape standard`), 6 commits ahead of `origin/main`, **not pushed**.

All verification is green as of this commit:

```
pnpm --filter @treasury-ops/api typecheck / lint / test / test:integration
pnpm --filter @treasury-ops/shared typecheck / lint / test
pnpm verify:migrations
```

Counts: 52 unit + 50 integration tests in `apps/api`, 27 tests in `packages/shared`.

## What shipped this session

### 1. `GET /v1/transactions` — cursor pagination

Filters: `accountId`, `categoryId`, `from`, `to`, `q` (case-insensitive description
substring), `cursor`, `limit`. Opaque base64url cursor over `(occurredAt, _id)`, backed
by the existing `{userId, occurredAt}` index (migration `005`).

### 2. Two-leg atomic transfers

`POST /v1/transfers` and `POST /v1/transfers/:transferGroupId/reverse`
(`apps/api/src/transactions/transfer.{service,controller}.ts`). Both legs (expense +
income) insert in one `withTxn`, share a `transferGroupId`
(migration `007-transfer-group.cjs`). Idempotency key lives only on the "from" leg —
a shared key across both legs would violate the unique sparse index, so replay lookup
walks `idempotencyKey → transferGroupId → sibling leg`. Reversal creates a **new**
linked transfer-reversal pair; only `transferGroupId` is accepted for reverting, never
a single leg. Concurrent create/reverse races are covered by 5-way parallel tests.

### 3. `PATCH /v1/transactions/:id` — non-monetary edits

`description` / `tags` / `categoryId` only (never `amountMinor`/`type`/`accountId`).
`categoryId: null` explicitly clears the category (vs. omitted = untouched — the
`exactOptionalPropertyTypes` + explicit-null convention from `API-STANDARDS.md` §2.1).
Writes a before/after snapshot to `audit_log.meta` in the same transaction. No
idempotency key — a PATCH is naturally safe to retry since it just sets fields, no
counter/balance involved.

### 4. Net-worth assets module (new: `apps/api/src/assets/`)

- `POST /v1/assets` — creates the asset **and its opening valuation** atomically, plus
  an audit entry. Kind-specific field validation lives in the zod schema
  (`packages/shared/src/asset.ts`): `maturityAt`/`annualRateBps` only on
  `fixed_deposit`, `quantityMilliUnits` only on `gold`/`silver`, negative
  `openingValueMinor` only on `loan_liability`.
- `GET /v1/assets` — list open (non-closed) assets.
- `POST /v1/assets/:id/close` — archive-not-delete, mirrors the accounts pattern.
- `POST /v1/assets/:id/valuations` — append-only snapshot. Guards: 404 if the asset
  doesn't exist _or is closed_ (same "doesn't-exist-or-inactive → 404" convention
  `accounts.applyBalanceDelta` already uses); 422 `asset.invalid_valuation_sign` if a
  non-liability asset gets a negative value.
- `GET /v1/assets/:id/valuations` — history, wrapped in the `{items, pageInfo}` list
  envelope for consistency even though it's not paginated yet (`hasMore: false` always).
- `GET /v1/net-worth` — accounts (open, non-archived) + latest valuation per asset
  (single aggregation, not N+1), liabilities net out via their negative value. Assets
  with no valuation yet report `valueMinor: 0, valuedAt: null`.
- Migration `008-net-worth-assets.cjs`: indexes on `{userId, isClosed}` (assets) and
  `{userId, assetId, valuedAt: -1}` (valuations).

### 5. `API-STANDARDS.md` core-shape compliance

Applied to every endpoint above (transactions, transfers, assets) — **not** retrofitted
onto `accounts`/`categories`/`user-profiles`/`health`/`auth` (see Known gaps below).

- **Success shapes**: bare resource, no `{data, replayed}` wrapper. `Location` header
  on fresh creates (`201`), `Idempotency-Replayed: true` + `200` on replay.
- **List envelope**: `{items, pageInfo: {nextCursor, hasMore, limit}}` — this is now
  the one shape every list endpoint uses, including the non-paginated valuation
  history.
- **Errors**: full RFC 7807 + TreasuryOps extensions (`code`, `reqId`, `timestamp`,
  `retryable`, `errors[]`). `ZodError` → `422` with per-field pointers (was `400`
  generic). `DomainError` now carries a typed `code: ErrorCode` (from the new
  `packages/shared/src/errors/codes.ts` catalog) and `retryable: boolean`.
  `common/errors/problem-json.filter.ts` is the only place that builds the response
  body; it has its own test suite (`__tests__/problem-json.filter.test.ts`) covering
  every branch (Zod, DomainError, 401/404/503 HttpException fallback, generic 500).

## Known simplifications (flagged deliberately, not oversights)

1. **`txn.already_reversed` is overloaded.** `TransactionService.reverse` and
   `TransferService.reverse` both throw `TransactionNotReversibleError` (409) for
   three distinct situations the catalog anticipates separately: transaction not
   found (should arguably be 404), already reversed, and "is itself a reversal."
   Splitting this needs one more lookup (`findById` without the status filter — it
   already exists on `TransactionRepository`, just isn't wired into the reverse path)
   plus a second error class for the not-found case. Left alone this session because
   it was scoped as "core shape only."
2. **Only transactions/transfers/assets throw proper `DomainError`s.**
   `account.service.ts`, `category.service.ts`, `user-profile.service.ts`,
   `health.service.ts`, and `auth.guard.ts` still throw raw NestJS exceptions
   (`NotFoundException`, `ServiceUnavailableException`, `UnauthorizedException`).
   They map correctly through `codeForStatus`'s fallback in the filter, but that's a
   bridge, not the "services only throw DomainError" architecture the standards doc
   specifies. Retrofitting those four files is a small, mechanical follow-up.
3. **No `Idempotency-Key` on asset/valuation writes.** Reasoned as acceptable: these
   are manual, low-frequency personal entries, and a duplicate valuation snapshot is
   easily spotted and correctable — unlike a double-posted ledger transaction that
   corrupts a balance.
4. **No metadata `PATCH` on assets** (name/maturity/rate edits) — wasn't asked for,
   `BACKEND.md` doesn't specify it either.
5. **Error-code catalog is intentionally minimal** — only codes actually thrown today:
   `common.validation_failed`, `common.not_found`, `common.invalid_cursor`,
   `common.internal`, `common.dependency_unavailable`, `auth.unauthenticated`,
   `txn.already_reversed`, `asset.invalid_valuation_sign`. The full catalog in
   `API-STANDARDS.md` §5 also lists codes for `imports.*`/`income.*`/`recurring.*`/
   `budget.*` — add those when those modules actually exist, not before.
6. **No `Retry-After` header** — `retryable: true` is set on 503s, but nothing
   computes an actual retry-after value (no rate limiter exists yet to make that
   meaningful).
7. **No OpenAPI spec, no `oasdiff`, no "error zoo" contract test suite** — all
   explicitly out of scope per the user's chosen implementation scope this session.

## Uncommitted, pre-existing work — not mine, needs separate attention

At the start of this session the working tree already had substantial uncommitted work
unrelated to the backend ledger — I left all of it untouched and it's still sitting
there:

- **Frontend** (`apps/web/*`): modified `next.config.ts`, layouts, `globals.css`,
  several `ui/` components, auth client/session code, plus a large batch of
  **untracked** files — `instrumentation.ts`, `lib/theme*.ts`, `lib/errors.ts`,
  `lib/debug.ts`, `lib/sentry-scrub.ts`, `lib/request-id.ts`, `components/app-nav.tsx`,
  `components/ui/theme-toggle.tsx`, an `e2e/` directory + `playwright.config.ts`, and
  matching `*.test.tsx`/`*.test.ts` files for most of the above.
- **Other backend test scaffolding**: untracked `__tests__/` directories under
  `accounts`, `auth`, `categories`, `health`, `user-profiles`,
  `common/config`, `common/logging`, plus `apps/api/vitest.config.ts`.
- **Root-level diffs**: `.gitignore` (adds `playwright-report/`, `test-results/`),
  `apps/api/package.json` (adds `test:e2e` script, `@vitest/coverage-v8`),
  `pnpm-lock.yaml`.
- **Untracked design docs**: `API-STANDARDS.md` (the doc this session implemented
  against), `LOGGING-BACKEND.md`, `LOGGING-FRONTEND.md`, `SALARY-MODULE.md`.

None of this was created or modified by me this session — it predates it. Worth a
deliberate look (and probably its own commit(s)) before it piles up further.

## What's still open from the original backend gap analysis

Everything below is **unstarted**, not simplified — full effort required:

- **CSV import pipeline** (`IMPLEMENTATION-PLAN.md` Phase 3) — upload, BullMQ parse
  job, staged rows, preview, chunked resumable commit, batch revert, HDFC/ICICI
  column-mapping presets, dedupe hashing.
- **`recurring/`, `budgets/`, `reports/`, `scheduler/`, `notifications/` modules** —
  none of these directories exist.
- **Salary/income module** (`SALARY-MODULE.md`) — profiles, effective-dated versions,
  materializer, payday/proration logic, reconciliation. Entirely unbuilt.
- **Infra**: BullMQ isn't wired to process jobs yet (`worker.ts` is just a Redis
  heartbeat). No `@nestjs/throttler`, no `@nestjs/schedule`. `common/time/` (the
  designated home for `Asia/Kolkata` date utilities per `AGENTS.md` §3/§4) is still an
  empty directory — several of the above depend on it.
- **Observability upgrade**: OpenTelemetry, `/metrics`, outbox pattern for
  notifications, circuit breaker on outbound calls, `explain()` query-budget CI check.
- **Auth hardening**: passkeys, 2FA (both mentioned in `BACKEND.md` §5 as follow-ons).

## Suggested next step

Two reasonable entry points, in order of how directly they build on this session:

1. **Retrofit `accounts`/`categories`/`user-profiles`/`health` to throw `DomainError`
   subclasses** instead of raw NestJS exceptions, and split the `txn.already_reversed`
   overload into a proper 404-vs-409 distinction. Small, mechanical, closes the
   biggest "known simplification" gaps above.
2. **Start Phase 3 (CSV imports)** — the next major feature phase. Needs BullMQ wired
   for real (currently just a heartbeat) and `common/time/` populated first, since the
   import pipeline's date parsing has zero tolerance for ambiguity per `BACKEND.md` §4.

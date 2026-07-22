# Comprehensive Seeding Plan

> Status: **implemented** (`apps/api/scripts/seed.ts` + `apps/api/scripts/seed/`). Two design
> assumptions below turned out wrong once actually run — see §9 for what changed and why.
> Original scope: replace `apps/api/scripts/seed.ts` (previously ~150 lines: one user, two
> accounts, seven flat categories, three transactions) with a seed that exercises every domain
> module and every background job (crons + BullMQ) this codebase actually has, so a developer
> can run one command and manually click through every screen in a realistic, non-trivial state.

## 1. What exists today (`apps/api/scripts/seed.ts`)

- One user (`demo@vyaya.local`), idempotent only at the "does this user exist" level — if it
  does, the whole script no-ops.
- Two accounts (bank, cash), seven categories (flat, no icon/color/parent), three
  transactions, all in the current month.
- Manually constructs each service (`new TransactionService(db, accounts, categories, ...)`)
  by hand-wiring its dependencies instead of going through Nest's DI container.

**Gaps** (everything this plan addresses): no transfers, no reversals, no recurring rules, no
assets, no imports (any status), no notifications, no rollups, no multi-month history, no
category rules, no category hierarchy/archiving, no second user, and no way to exercise any of
the five `@Cron` jobs without waiting for real wall-clock time.

## 2. Full feature inventory (what "comprehensive" means here)

Every domain module under `apps/api/src`, and the seed scenario that exercises it:

| Module | Seed scenario |
|---|---|
| `accounts` | One account per `AccountType` (`bank`, `credit_card`, `cash`, `wallet`, `investment`) + one archived account |
| `categories` | Income + expense categories, a parent/child pair, icon/color set on some, one archived |
| `category-rules` | 4-5 substring rules (`SWIGGY`→Dining, `IRCTC`→Travel, `AMAZON`→Shopping, …) — feeds import auto-suggest |
| `transactions` | Multi-month history (see §3), covering every `TransactionStatus` (`posted`, `reversed`, `reversal`) and every `TransactionSource` (`manual`, `csv_import`, `recurring`, `api`) |
| `transactions` (transfers) | One plain transfer, one transfer created then reversed |
| `recurring` | 2+ rules with `startAt` in the past so they're immediately due, one paused rule |
| `assets` | One of each `AssetKind` (`loan_receivable`, `loan_liability`, `fixed_deposit`, `gold`, `silver`, `investment`) with a follow-up valuation on at least one, one closed asset |
| `imports` | Three batches: one left `staged` (preview screen), one `committed` (incl. a duplicate row and a bad-data row), one `committed` → `reverted` |
| `notifications` | A manufactured `balance_drift` (real detection, not a fake row — see §4), plus one hand-inserted `budget_alert` / `monthly_report` entry each, since those types have no producer yet |
| `reports` | Rollups recomputed for every seeded month, not just current+previous (the real cron is deliberately narrow — see §4) |
| `export` | No seeding needed — reads whatever exists; multi-month + reversed/reversal data above already exercises the CSV's status filtering |
| `audit` | No seeding needed — every service call above already writes audit rows as a side effect |
| `user-profiles` | Created automatically by Better Auth sign-up; seed just sets a realistic `displayName` |
| `balances` | Exercised via the manufactured-drift scenario in §4 |

## 3. Multi-user, multi-month data shape

- **Two users**, not one: `demo@vyaya.local` (fully seeded, everything in §2) and
  `demo2@vyaya.local` (a light dataset — one account, a few transactions). The second user
  exists so a developer can manually confirm tenant isolation in the running UI (log in as
  each, confirm no cross-visibility) — the same property already covered by integration tests
  (`docs/reviews/vyaya-backend-standards.md`'s ownership-test coverage), just now also
  checkable by hand.
- **Dates are computed relative to "now"**, never hardcoded absolutes — e.g. "3 months ago"
  through "next month" — so the seed produces a currently-relevant spread and recurring
  rules' `nextRunAt` is genuinely due, regardless of what day the script runs.
- Transaction volume: enough per month (~15-30) to make the reports/category breakdown charts
  look real, not like three test fixtures.

## 4. The cron/BullMQ problem, and how to solve it

All five `@Cron` jobs guard on `this.config.env.SERVICE_ROLE !== "worker"` and no-op
otherwise (`RecurringMaterializeService`, `RollupsRefreshService`, `BalanceVerifyService`,
`NotificationSweepService`, `StagedRowsCleanupCron`). Their schedules are daily/weekly IST
times — useless to wait on during interactive seeding. Two different mechanisms are needed,
because the jobs split into two kinds:

**a) Pure-DB crons (recurring materialize, rollups refresh, balance verify, staged-rows
cleanup)** — call these directly, once, right after seeding:

- Boot the seed script via `NestFactory.createApplicationContext(AppModule)` — the exact
  pattern `worker.ts` already uses — instead of hand-constructing services. This is the
  single biggest correctness win: seed.ts today manually re-wires `TransactionService`'s
  constructor args, which silently drifts the moment that constructor changes. Going through
  Nest's DI container means the seed script always gets production-wired instances.
- Force `process.env.SERVICE_ROLE = "worker"` **before** creating that application context
  (in the seed script's own process only — never touches the real running containers), so
  the guards pass.
- Invoke each cron service's public method directly, in this order: `RecurringMaterializeService.materialize()` → `RollupsRefreshService.refresh()` (then also directly call `MonthlyRollupRepository.recompute()` for every seeded month — the real cron only ever does current+previous, which isn't enough for a multi-month seed) → `BalanceVerifyService.verify()` → `NotificationSweepService.sweep()`. `StagedRowsCleanupCron.run()` is safe to skip (only deletes staged rows older than 7 days, i.e. never touches freshly-seeded data) but is harmless to include for completeness.

**b) BullMQ-backed jobs (imports parse, notification delivery)** — these need a real consumer.
Rather than faking that, rely on the **already-running `worker` container**
(`docker compose up -d worker`, per the `restart-docker-local` skill): the seed script calls the real
`ImportsService.createBatch()` (which really enqueues via `ImportsQueue`) and, after §4a's
`NotificationSweepService.sweep()` enqueues delivery jobs, the real `NotificationsProcessor` in
that container consumes both queues exactly as it would in production. This is deliberately
more "real" than hand-calling internal parse/deliver methods — it also validates the queue
wiring itself, not just the DB writes.
- **Precondition, stated explicitly in the script's own startup check**: if the worker
  container isn't reachable (heartbeat check via `RedisService.hasWorkerHeartbeat()`, already
  used by `worker-health.ts`), warn loudly and either abort the imports/notifications steps or
  poll with a timeout.
- After `createBatch()`, poll `ImportBatchRepository.findById` until `status !== "pending"`
  (bounded timeout, e.g. 15s) before calling `commitBatch` — parsing is now genuinely
  asynchronous.

**Manufactured balance drift** (for a *real* `balance_drift` notification, not a fake row):
after normal seeding, directly call `AccountRepository.applyBalanceDelta` (or an equivalent
raw update) to nudge one account's `balanceMinor` away from what its ledger implies — this is
the same technique the drift-detection logic exists to catch, so running §4a's
`BalanceVerifyService.verify()` afterward produces a genuine drift row, a genuine outbox entry,
and a genuine delivery through the real pipeline, end to end.

## 5. Script structure

Split the current single 150-line file into a directory, one module per domain, orchestrated
by a slim entrypoint — mirrors how `apps/api/src` itself is organized by feature module, so the
seed script's shape isn't a surprise to anyone who's read the rest of the codebase:

```
apps/api/scripts/
  seed.ts                  # entrypoint: app context, ordering, summary printout
  seed/
    users.ts               # both demo users via Better Auth signUpEmail
    accounts.ts
    categories.ts
    category-rules.ts
    transactions.ts         # multi-month history, transfers, reversals
    recurring.ts
    assets.ts
    imports.ts              # builds a small in-memory CSV fixture per batch
    notifications-and-drift.ts
    trigger-crons.ts         # §4a's forced-worker-role invocation
    reset.ts                 # §6's table-scoped, reverse-dependency-order delete
    fixtures/
      hdfc-statement.csv     # real COLUMN_MAPPING_PRESETS.hdfc shape, incl. one dup, one bad date
```

Each domain's `seed/*.ts` file also owns its own slice of `reset.ts`'s delete order — see §6.

Each `seed/*.ts` file exports one function taking whatever repositories/services it needs
(pulled from the app context by the entrypoint) and the prior step's output IDs (account IDs,
category IDs, …), returning what later steps need in turn. No file reaches into another
domain's repository directly — same cross-module boundary rule `AGENTS.md` already holds the
app code to.

## 6. Idempotency, `--reset`, and safety

- Keep the existing top-level idempotency guard (skip entirely if `demo@vyaya.local` already
  exists) as the default — safe, matches current behavior, good enough for CI/first-run.
- Add an explicit `--reset` flag for local dev iteration, deleting both demo users and
  everything they own before reseeding.

**How `--reset` actually deletes (decided): no cascade — table-scoped, ordered, transactional
deletes.** Checked every `.references(() => ...)` call across `apps/api/src/common/db/schema/*.ts`:
none specify `{ onDelete: "cascade" }`, so Postgres's default `NO ACTION` applies everywhere. A
raw `DELETE FROM "user" WHERE id = $1` would simply throw a foreign-key violation today — cascade
isn't available without a new migration. That's also the *correct* state for an append-only
ledger: cascade-deletable money tables is exactly the kind of implicit, hard-to-reverse capability
this schema should not silently support, even for a dev convenience flag. So `reset.ts` deletes
per table, scoped by `userId`, in explicit reverse-dependency order, all inside one
`withTxn` — the same pattern every money-write service in this codebase already uses, just for
deletes instead of inserts:

```
staged_rows (by batch)        →  import_batches
valuations                    →  assets
transactions                  →  recurring_rules, category_rules
accounts, categories          →  (now childless)
notification_outbox, audit_log, idempotency_records
user_profiles                 →  user  (Better Auth's own session/account/verification rows
                                         for that user id — check auth-schema.ts's own FK
                                         cascade settings; if Better Auth already cascades
                                         those, only the `user` row itself needs deleting there)
```

Self-referential FKs on `transactions` (`reversalOf`/`reversedBy`) are safe in one
`DELETE FROM transactions WHERE user_id = $1` — Postgres evaluates FK constraints against the
post-statement state, so a full-user delete in a single statement doesn't trip over rows
referencing each other within that same statement.

- **Guard `--reset` behind a non-production check** — refuse to run if
  `config.env.NODE_ENV === "production"`, printing a clear error. This is a destructive
  operation on a real Postgres database; per this repo's own git-safety norms, destructive
  flags need an explicit opt-in and a hard stop for anything that looks like prod.
- Print a final summary: what was created (counts per entity), the demo login credentials
  (already the convention — see current seed.ts's `console.log`), and which cron/BullMQ steps
  ran vs. were skipped (e.g. "worker not detected — imports/notifications steps skipped").

## 7. Explicitly out of scope for this script

- **Idempotency-key replay testing** (double-submit → same result) — already covered by
  existing integration tests; the seed script's job is leaving data in place for manual
  exploration, not running assertions.
- **Rate-limit exercising** — a runtime/load concern, not a data-shape concern; a curl loop,
  not a seed.
- **Budgets** — no `budgets` module exists yet (per root `CLAUDE.md`'s "current implementation
  state"); nothing to seed until it's built.

## 8. Decisions (previously open questions)

1. **Two demo users, fixed** — no `SEED_SECONDARY_USERS` config knob. `demo@vyaya.local`
   (fully seeded) + `demo2@vyaya.local` (light dataset, for manual tenant-isolation checks).
2. **`--reset` deletes table-scoped by `userId`, in reverse-dependency order, inside one
   transaction — not cascade.** See §6 for the full rationale and delete order.
3. **Fixture CSV reuses `COLUMN_MAPPING_PRESETS.hdfc` verbatim** — same column names/mapping
   already exercised by `imports.parse.integration.ts`, so the seeded import batch is testing
   the same shape of real-world data the test suite already trusts, not a bespoke format that
   could drift from what the parser actually handles.

Nothing left open — ready for implementation.

## 9. What changed once actually implemented and run

Two of the above turned out to be wrong in practice — both discovered by running the script
against the real local stack, not by inspection:

**§4a's `NestFactory.createApplicationContext(AppModule)` plan was not viable.** `tsx` (the
runner `apps/api/package.json`'s `seed` script already used, and the only sane way to run a
TypeScript script here without a separate build step) transforms TypeScript via esbuild —
which, like Vitest's default transform (see the comment in `vitest.integration.config.ts`),
does not implement `emitDecoratorMetadata`. Any constructor parameter without an explicit
`@Inject()` token resolves to `undefined` at runtime, and Nest's injector throws
`UndefinedDependencyException` the moment it tries to instantiate the first affected service
(`BalanceVerifyService`, in practice — its `RuntimeConfigService` param has no explicit
`@Inject()`). `worker.ts`/`main.ts` never hit this because they only ever run from `dist/*.js`
(real `tsc` output, via plain `node`), never through `tsx` directly. This is exactly why the
*original* single-file `seed.ts` manually constructed its handful of services instead of
booting Nest — not an oversight, a hard constraint. `apps/api/scripts/seed/context.ts` now
manually wires every service in dependency order instead, extending that same pattern to the
full service set. Nothing about the rest of the design changed: `SeedServices`' shape is
identical either way, so every domain module (`seed/accounts.ts`, `seed/transactions.ts`, …)
needed zero changes — only `context.ts`'s internals did.

**§6's `NODE_ENV === "production"` guard on `--reset` was actually backwards for this repo.**
`.env.development.local` deliberately sets `NODE_ENV=production` even for local dev (per its own
comment: "same image, different env" — environments are distinguished by which
`DATABASE_URL`/`REDIS_URL` you point at, never by `NODE_ENV` branches in business code, per
`AGENTS.md`). A guard on `NODE_ENV` would therefore *always* refuse to run locally too,
defeating the flag. Worse, staging and production share the same DB name/host shape
(`env.example`), differing only in credentials — there's no structural signal in the connection
string to detect "this is really prod" at all. Replaced with an interactive confirmation:
`confirmReset()` prints the resolved host/database (never credentials) and requires typing
"yes" before deleting anything. No non-interactive bypass flag exists on purpose.

**Known caveat, not fixed (environment-specific, not a script bug):** `.env.development.local`
points host-native tools at `REDIS_URL=redis://127.0.0.1:6379/2`, while the dockerized `worker`
container uses `redis://host.docker.internal:6379/0` — same physical Redis, different logical
database. Running the seed script host-natively against the docker-compose stack means its
`hasWorkerHeartbeat()` check (and the imports/notifications BullMQ steps that depend on it) will
report "no worker detected" even when the worker container is healthy, because it's reading the
wrong DB index. Verified working correctly end-to-end (all three import batches parsed to their
expected statuses, all 3 outbox entries delivered) when run with `REDIS_URL` overridden to
`redis://127.0.0.1:6379/0` for that one invocation. Not fixed at the env-file level since that
file's db-2 convention likely exists deliberately to keep a host-native `pnpm dev` API process
from fighting the containerized stack over the same queues — changing it was out of scope for a
seed script.

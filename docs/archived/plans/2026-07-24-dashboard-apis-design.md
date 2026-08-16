# Dashboard analytics APIs: by-month, by-year, trends, comparisons, net worth history

## Context

TreasuryOps has exactly one analytics endpoint today (`GET /v1/reports/monthly/:month`), backed by a nightly-cron-populated `monthly_rollups` cache that only ever recomputes the current and previous month. There's no way to see a year at a glance, a spending trend over several months, a category's history, a month-over-month comparison, or net worth over time — `docs/design-briefs/08-reports.md` and `docs/frontend/QOL-GAPS-ANALYSIS.md` both explicitly flag this as a gap ("no range of months", "no time-period comparisons"). The goal is a broader set of read APIs so a real dashboard can be built on top: by-month, by-year, trends, comparisons, and (per the agreed scope below) net worth history — enough for the user to actually see and improve their spending patterns.

Agreed scope (from prior discussion):
- Net worth history is in scope, not just spending/income (new snapshot table + cron, mirroring the existing rollup pattern).
- Missing historical months are filled in **lazily on demand** (computed once when first requested, cached forever after) — no upfront backfill migration.
- Month-over-month / year-over-year **comparison** endpoints are in scope (delta + percentage).

This document is a design only; implementation has not started.

## What already exists (do not rebuild)

- `monthly_rollups` table (`apps/api/src/common/db/schema/report.ts`) + `MonthlyRollupRepository.recompute(userId, month)` / `.findByMonth(userId, month)` (`apps/api/src/reports/monthly-rollup.repository.ts`) — three `GROUP BY` queries (by category, by account, totals), IST month bucketing via `to_char(occurred_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`, fully recomputed (not incremental), upserted on `(userId, month)`.
- `RollupsRefreshService` (`apps/api/src/reports/rollups-refresh.service.ts`) — nightly `@Cron("0 2 * * *", {timeZone: "Asia/Kolkata"})`, worker-role-guarded, recomputes **current + previous month only**, for every user with ≥1 posted transaction.
- `GET /v1/reports/monthly/:month` (`report.controller.ts`) — cache read only, 404s on miss, no live fallback.
- Shared schemas: `MonthSchema`, `MonthlyRollupSchema`, `CategoryRollupSchema`, `AccountRollupSchema` (`packages/shared/src/report.ts`).
- `NetWorthService.get(userId)` (`apps/api/src/assets/net-worth.service.ts`) — **snapshot only**, always "as of now": current account `balanceMinor` + latest asset valuation per asset. No history.
- Two reusable historical-reconstruction patterns already proven elsewhere:
  - `BalanceVerifyRepository.sumDeltasByAccount()` (`apps/api/src/balances/balance-verify.repository.ts`) — reconstructs an account's net lifetime delta by summing *every* transaction's signed `amountMinor` regardless of status (a reversal adds an opposite row rather than removing the original's contribution). Add an `asOf`-bounded variant of this for historical balances.
  - `ValuationRepository.findLatestForAssets()` (`apps/api/src/assets/valuation.repository.ts`) — latest valuation per asset via an in-memory dedupe over one ordered query (no `DISTINCT ON` support in the pinned drizzle-orm version). Add an `asOf`-bounded variant for historical asset values.
- `toISTMonth`/`toISTCalendarDate` (`apps/api/src/common/time/ist.ts`) — no `toISTYear` yet.
- Frontend: `/reports` (single month, pie/bars/totals) and `/` (accounts overview, unrelated) — no unified dashboard screen exists.

## Design

### A. Lazy on-demand backfill for monthly rollups

New `MonthlyRollupService.getOrCompute(userId, month)`: call `findByMonth`; if null and `month` is not after the current IST month, call `recompute` (writes + returns); if `month` is after the current IST month, return `null` (can't compute the future). Update `ReportController.monthly` to use this instead of a bare cache read. This is the load-bearing change everything else depends on — a year or trend view needs every month in range to resolve, not just the two the nightly cron happens to keep warm, and this avoids a separate backfill migration entirely.

Note: this changes behavior for old months that predate the cron ever running for a user — they'll now compute successfully (possibly to an all-zero rollup) instead of 404ing. `report-empty-state.tsx`'s "predates you" vs. "in progress" distinction on the frontend may need to key off the user's earliest transaction date rather than rollup-null once this ships — flagged for the frontend phase, not a backend blocker.

### B. New `toISTYear` helper

`apps/api/src/common/time/ist.ts`: `toISTYear(date) = toISTCalendarDate(date).slice(0, 4)` — mirrors `toISTMonth` exactly.

### C. Net worth history (new table + cron + historical reconstruction)

- New table `net_worth_snapshots` in `apps/api/src/common/db/schema/report.ts` (same file/shape as `monthly_rollups`): `userId, month text, netWorthMinor bigint, accountsMinor bigint, assetsMinor bigint, computedAt timestamptz`, PK `(userId, month)`.
- New repository methods (date-bounded siblings of the two patterns above):
  - `BalanceVerifyRepository`-adjacent: `sumDeltasByAccountAsOf(userId, asOf)` — same signed-sum-regardless-of-status query, filtered to `occurredAt <= asOf`, grouped by `accountId`. Historical balance per account = `openingBalanceMinor + delta`. Include every account with `createdAt <= asOf`, regardless of current `isArchived` (a since-archived account still counted toward net worth back then).
  - `ValuationRepository.findLatestForAssetsAsOf(userId, assetIds, asOf)` — same in-memory-dedupe-over-one-ordered-query pattern, filtered to `valuedAt <= asOf`.
- New `NetWorthSnapshotRepository.recompute(userId, month)`: `asOf` = last instant of that month in IST for a past month, or "now" for the current month (so today's figure stays live-accurate, matching existing `NetWorthService` semantics) — combine the two historical queries above into `netWorthMinor = accountsMinor + assetsMinor`, upsert into `net_worth_snapshots`. Plus `findByMonth`, mirroring `MonthlyRollupRepository` exactly.
- New `NetWorthSnapshotsRefreshService` — sibling cron next to `RollupsRefreshService` (same `@Cron`, same worker-role guard, current + previous month, every user), and the same lazy `getOrCompute` wrapper as (A) for historical backfill on read.

### D. New shared schemas (`packages/shared/src/report.ts`)

- `YearSchema` (`^\d{4}$`).
- `MonthlyTotalsSchema` — lightweight `{ month, totalExpenseMinor, totalIncomeMinor }`, for trend arrays that don't need full category/account breakdowns.
- `YearlyRollupSchema` — `{ year, byCategory: CategoryRollup[], byAccount: AccountRollup[], byMonth: MonthlyTotals[], totalExpenseMinor, totalIncomeMinor, monthsWithData: number }`.
- `SpendingTrendSchema` — `{ items: MonthlyTotals[] }`.
- `CategoryTrendSchema` — `{ categoryId?: string, items: [{ month, spentMinor, incomeMinor, txnCount }] }`.
- `PeriodComparisonSchema` — `{ current: {...totals}, previous: {...totals}, deltaExpenseMinor, deltaExpensePct: number | null, deltaIncomeMinor, deltaIncomePct: number | null }` (`null` pct when the previous period's total is 0 — avoid divide-by-zero).
- `NetWorthSnapshotSchema` — `{ month, netWorthMinor, accountsMinor, assetsMinor, computedAt }`.
- `NetWorthTrendSchema` — `{ items: NetWorthSnapshot[] }`.

### E. New endpoints (all under `/v1/reports`, existing controller conventions — inline `Schema.parse`, no `ZodValidationPipe`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/reports/monthly/:month` | existing — now backed by lazy `getOrCompute` |
| GET | `/v1/reports/yearly/:year` | aggregate all months in the year |
| GET | `/v1/reports/trend?from=YYYY-MM&to=YYYY-MM` | `MonthlyTotals[]` across an arbitrary range, for a spend-over-time chart |
| GET | `/v1/reports/categories/:categoryId/trend?from=&to=` | one category's spend/income/txnCount across months (drill-down) |
| GET | `/v1/reports/compare?period=YYYY-MM&against=previous\|year_ago` | current vs. comparison period, delta + pct |
| GET | `/v1/reports/net-worth/history?from=YYYY-MM&to=YYYY-MM` | `NetWorthSnapshot[]` |

### F. Aggregation approach — compose over rollups, no new raw SQL for most of this

Everything in (E) except net worth history is built by calling `MonthlyRollupService.getOrCompute` for each month in range and reducing in TypeScript:
- **Yearly**: up to 12 `getOrCompute` calls; sum `totalExpenseMinor`/`totalIncomeMinor`; merge `byCategory`/`byAccount` arrays across months by `categoryId`/`accountId`; keep each month's totals as `byMonth`.
- **Trend**: same calls, no merging — just collect `{month, totalExpenseMinor, totalIncomeMinor}` per month.
- **Category trend**: same calls, pluck the one matching entry out of each month's `byCategory` array (or zero if the category had no activity that month).
- **Compare**: two `getOrCompute` calls (current period, and either the prior calendar month or the same month a year back), diff the totals.

This keeps "dashboard reads/derives from rollups" as the one aggregation path end to end (matching the existing `report.controller.ts` design comment) rather than introducing a second, parallel live-aggregation code path. At personal-finance data volumes, up to ~24 `getOrCompute` calls per request (each O(1) once cached) is cheap — no Redis or extra caching layer needed, consistent with the decision not to build the aspirational Redis layer mentioned in `BACKEND.md` but never implemented.

Net worth history is the one place with genuinely new aggregation logic (historical balance/valuation reconstruction, §C) since there's no existing per-month net-worth rollup to compose over.

## Extension: concrete `/v1/dashboard/*` endpoints for the Home & Insights screens

The frontend team specified the actual screen-shaped endpoints Home and Insights need. These supersede the generic `/v1/reports/yearly|trend|compare|net-worth/history` set in §E as the implementation target — building both a generic analytics layer *and* a screen-shaped one would be two overlapping surfaces for the same underlying data. §A (`MonthlyRollupService.getOrCompute`) is still implemented and reused internally; §C's net-worth-history reconstruction queries are still needed, but as **live, on-demand computation, not a persisted `net_worth_snapshots` table + cron** — a handful of aggregate queries per request is cheap enough at personal-finance scale that a whole new cached-snapshot subsystem isn't justified yet. Revisit if read volume ever makes that untrue.

All endpoints below are read-only, namespaced `/v1/dashboard`, existing controller conventions (inline `Schema.parse`, no `ZodValidationPipe`).

### Home

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/dashboard/summary` | `{ totalBalanceMinor, activeAccountCount, assetsMinor, liabilitiesMinor }` — sum of non-archived accounts, split by balance sign (mirrors `account-manager.tsx`'s existing client-side assets/liabilities split, now computed server-side) |
| GET | `/v1/dashboard/recent-activity?limit=` | latest posted transactions (default 10, max 50) with account name resolved — reuses `TransactionRepository.findMany` + `AccountRepository.list`, joined in the service layer rather than a new SQL join |

### Insights

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/dashboard/stats?period=YYYY-MM` | 4 stat cards (spent, income, savingsRate, netWorth), each `{ valueMinor \| valuePct, deltaPct, trend[] }` — MoM delta + trailing-6-month trend. `period` defaults to the current IST month. Built from `getOrCompute` (spent/income/savingsRate) + live net-worth reconstruction (netWorth) |
| GET | `/v1/dashboard/cashflow?range=1W\|1M\|6M\|12M` | `{ range, buckets: [{ label, incomeMinor, expenseMinor }] }` — `1W` = 7 daily buckets (new live day-grained query, §below); `1M` = 4 trailing 7-day buckets (same daily query, grouped in JS); `6M`/`12M` = monthly buckets via `getOrCompute` |
| GET | `/v1/dashboard/top-spending?range=&limit=` | `[{ categoryId?, name, icon?, color?, amountMinor, txnCount }]` descending, same range semantics as cashflow, category metadata joined from `CategoryRepository.list` |
| GET | `/v1/dashboard/spend-mix?range=` | essentials-vs-lifestyle split — see "Schema gap: category grouping" below |
| GET | `/v1/dashboard/investments` | `[{ assetId, name, kind, currentValueMinor, returnPct, series[] }]` for asset kinds `investment`/`fixed_deposit` (there's no separate "MF" kind — a mutual fund is just an `investment`-kind asset by name), `returnPct` = latest valuation vs. the asset's opening valuation, `series` = that asset's valuation history (already stored, per `asset_valuations`) |
| GET | `/v1/dashboard/recurring-forecast?range=` | `{ inMinor, outMinor, netMinor, upcoming: [{ ruleId, name, icon?, type, amountMinor, nextRunAt }] }` — walks each active recurring rule's occurrences within the range window via the existing pure `computeNextOccurrence` function, summing by type; `name` = the rule's `template.description` (rules have no separate name field today); `icon` = the template's category icon, if any |

### Schema gap: category grouping (essential vs. lifestyle)

Categories have no notion of "essential" vs. "lifestyle" today. Decision: **add it**, rather than drop the panel — it's a single nullable enum column, not a structural change:
- New `category_group` enum (`'essential' | 'lifestyle'`), nullable column on `categories` (additive migration).
- `spend-mix` groups the same category-totals data source as `top-spending` by `category.group` instead of `categoryId`; a `categoryId` with no group (or no `categoryId` at all — uncategorized) falls into a third `uncategorized` bucket, never silently dropped.
- **Existing categories have no way to acquire a group** (there's no general category-update endpoint today, only `create` and `archive` — `apps/api/src/categories/category.controller.ts`). Adding one narrow endpoint, `PATCH /v1/categories/:categoryId/group`, is the minimum needed to make this panel actually usable rather than permanently empty for anyone who created categories before this shipped. Kept single-purpose (just `group`) rather than a general category-update endpoint, to avoid scope creep into the categories module.

### Schema gap: investment valuation series

No gap — `asset_valuations` already stores a full history per asset (`ValuationRepository.listByAsset`), so the `investments` endpoint's `series[]` is a direct, un-downsampled read of existing data (a personal investment asset gets at most a handful of valuations a year — no downsampling logic needed at this scale).

## Frontend (lean pass — API shapes first, fuller chart build as a follow-up)

- New hooks (e.g. `apps/web/src/features/reports/hooks/`) calling the new endpoints through the generated typed client — all plain GET/JSON, no multipart, so none of the raw-`fetch` exceptions used by imports/bills apply here.
- New line/bar time-series chart components — **must** follow the `dataviz` skill's palette and mark-spec guidance when actually built; not designed here.
- Candidate new screen: a `/dashboard` route distinct from the existing single-month `/reports` page — yearly bar chart, trailing-N-month expense/income trend line, top categories, net worth trend line, and "vs. last month" comparison callouts. `/reports` stays as the detailed single-month drill-down.

## Testing

- Unit: `toISTYear`; yearly-merge reduction logic (category/account merge across months); trend range iteration; comparison delta/pct math (including the previous-total-is-zero → `null` pct case); historical balance/valuation reconstruction math.
- Integration (testcontainers, per `vitest.integration.config.ts`): `getOrCompute` backfills a month with no cron-written row; yearly endpoint aggregates correctly across a year mixing backfilled and cron-written months; trend endpoint spans a range including zero-transaction months; net-worth-history recompute matches expected historical balances against a fixture with an account archived partway through and transactions before/after; compare endpoint against known fixtures.
- Add `apps/api/bruno/reports/` entries for each new route, mirroring existing Bruno collection conventions.
- Definition of done: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm verify:migrations && pnpm gen:client` before `pnpm build` (AGENTS.md §7).

## Suggested implementation order

1. `toISTYear` helper + `MonthlyRollupService.getOrCompute`, wired into the existing `/monthly/:month` endpoint (small, immediately useful, unblocks everything else).
2. Yearly + trend + category-trend + compare endpoints — pure composition over existing rollups, no new tables.
3. Net worth snapshot table + historical-reconstruction repository methods + cron + net-worth history endpoint (the one genuinely new, higher-effort piece).
4. Frontend dashboard screen consuming all of the above.

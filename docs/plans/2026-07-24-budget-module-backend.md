# Budget Module — Backend Proposal

**Status:** Proposal only. Do not implement until this document is reviewed and approved.

**Goal:** Add current-month, category-based spending limits with accurate ledger-derived progress
and deduplicated threshold-alert events.

**Implementation order:** Backend first. The dependent frontend proposal is in
[`2026-07-24-budget-module-frontend.md`](./2026-07-24-budget-module-frontend.md).

## 1. Product boundary

The first release answers one question:

> How much of the amount I planned for this expense category have I used this month?

It supports:

- one active monthly budget per expense category;
- positive integer-paise limits in INR;
- live current-month spent, remaining, and utilization values;
- editing, archiving, and restoring a budget without touching ledger entries;
- automatic 80% and 100% threshold events, at most once per threshold per month.

It does not initially support:

- weekly, annual, or custom periods;
- an overall household/income budget;
- rollover or carry-over balances;
- envelope transfers;
- parent-category aggregation;
- Uncategorized budgets;
- savings goals or recurring-bill reservations;
- historical budget snapshots or backdated budget definitions;
- custom alert thresholds or per-channel notification preferences;
- forecasts, recommended limits, or financial advice.

These exclusions keep the first module explainable and avoid inventing ambiguous money semantics.

## 2. Repository findings that constrain the design

- All amounts are integer paise and INR-only. Budget limits, spent amounts, remaining amounts, and
  alert evidence follow the same rule.
- Transactions count only when they are:
  - owned by the user;
  - `type = 'expense'`;
  - `status = 'posted'`;
  - `transfer_group_id IS NULL`;
  - assigned to the budget's exact category;
  - inside the current IST calendar month.
- Reversed originals and compensating reversals are excluded by the posted-status rule. Transfers
  must also be excluded explicitly.
- Categories can be nested, but current rollups group exact category IDs. The initial budget
  semantics therefore use the exact selected category, not descendants.
- The existing monthly rollup is refreshed nightly and currently does not exclude transfer legs.
  Budget progress must not inherit different eligibility semantics, so the current-month endpoint
  uses one bounded aggregate over raw transactions instead.
- Category archival does not invoke other feature services. A category becoming archived makes its
  budget ineffective for new progress/alerts without deleting budget history.
- The notification outbox and `budget_alert` type already exist. The budget module produces
  transactional outbox entries; it does not send HTTP notifications from business logic.
- The current notification adapter is a logging stub. This plan produces and safely drains alert
  events, but real ntfy/Telegram delivery remains a separately reviewed notification-adapter task.

## 3. Research basis

- The Reserve Bank of India's
  [financial-planning workbook](https://www.rbi.org.in/FinancialEducation/content/I%20Can%20Do_RBI.pdf)
  organizes planning around income and household expenses.
- The Consumer Financial Protection Bureau's
  [spending guidance](https://files.consumerfinance.gov/f/documents/201702_cfpb_Consumer-Tips-on-Managing-Spending.pdf)
  recommends tracking category spending and comparing actual spending with a budget monthly or
  more frequently.
- The CFPB's
  [spending assessment](https://www.consumerfinance.gov/owning-a-home/prepare/assess-your-spending/)
  recommends looking across several months when choosing realistic category amounts. The product
  may display prior spending as context later, but it must not generate a supposedly “correct”
  limit.
- PostgreSQL
  [unique constraints and indexes](https://www.postgresql.org/docs/17/ddl-constraints.html)
  support enforcing one configuration per user/category and one alert event per
  budget/month/threshold at the database boundary.

The sources support category-based planning and actual-versus-planned comparison. The 80% and
100% alert points come from the repository's existing product specification and remain an explicit
review decision.

## 4. Calculation contract

### 4.1 Time boundary

- `month` is derived from the request/job clock with the existing `Asia/Kolkata` utilities.
- Start is IST midnight on the first calendar day, converted to UTC.
- End is IST midnight on the first day of the next month, converted to UTC.
- The transaction predicate uses `occurred_at >= start AND occurred_at < end`.
- Production supplies the clock; tests inject a fixed instant.

The first release always reports the current IST month. It does not accept an arbitrary month,
because mutable configurations cannot accurately reconstruct historical plans.

### 4.2 Exact-category spending

For each active budget:

```text
spentMinor =
  SUM(amountMinor)
  WHERE user/category match
    AND type = expense
    AND status = posted
    AND transferGroupId IS NULL
    AND occurredAt is in current IST month
```

No descendant categories are included. The API and UI state “exact category” so a parent and child
budget cannot silently double-count the same transaction.

### 4.3 Derived values

```text
remainingMinor = limitMinor - spentMinor
utilizationBps = floor(spentMinor × 10_000 / limitMinor)
```

- `remainingMinor` may be negative.
- `utilizationBps` may exceed `10_000`.
- Intermediate ratio arithmetic uses `bigint` or PostgreSQL numeric arithmetic to avoid unsafe
  multiplication; money values remain safe integer paise at the shared-schema boundary.

State:

- `under`: utilization below 80%;
- `approaching`: utilization from 80% through 99.99%;
- `reached`: utilization at least 100%.

The state is presentation metadata, not financial advice.

### 4.4 Overview totals

The response includes totals over every effective budget, independent of pagination:

- `plannedMinor`: sum of active limits;
- `spentInBudgetedCategoriesMinor`;
- signed `remainingMinor`;
- `unbudgetedSpentMinor`: eligible current-month expense spend whose exact category has no
  effective budget, including Uncategorized;
- active budget count.

This makes it clear that adding three category budgets does not account for all monthly spending.

## 5. Persistence model

All changes are additive and generated through drizzle-kit.

### `budgets`

- `id` UUID primary key;
- `user_id` user foreign key;
- `category_id` category foreign key;
- `limit_minor` positive bigint in number mode;
- `is_archived` boolean, default false;
- `created_at`, `updated_at`;
- unique `(user_id, category_id)`;
- index `(user_id, is_archived, created_at, id)`.

There is one lifetime configuration per user/category. `PUT` updates or restores it. Archival is
recoverable and preserves audit history. No hard-delete endpoint is added.

The table does not store `spentMinor`, `remainingMinor`, or utilization. Those values are derived
from the append-only ledger and cannot become stale caches.

### `budget_alert_events`

Immutable deduplication/evidence rows:

- `id` UUID primary key;
- `user_id` user foreign key;
- `budget_id` budget foreign key;
- `month` validated `YYYY-MM`;
- `policy_version` positive integer;
- `threshold_bps` (`8000` or `10000` for policy version 1);
- `spent_minor` and `limit_minor` snapshots;
- `created_at`;
- unique `(user_id, budget_id, month, policy_version, threshold_bps)`;
- index `(user_id, month, created_at)`.

The snapshots explain why an alert fired even if the user later edits the limit or reverses a
transaction. Events are never updated or deleted.

Every budget repository method takes `userId` first and includes it in every filter.

## 6. Shared contracts

Add zod schemas and derive every exported type:

- `BudgetIdSchema`;
- `BudgetSchema`;
- `UpsertBudgetSchema`;
- `BudgetProgressStateSchema`;
- `BudgetProgressSchema`;
- `BudgetOverviewSchema`;
- `ListBudgetsQuerySchema`;
- `BudgetPageSchema`.

Rules:

- `limitMinor` is a positive safe integer;
- money fields are integer paise;
- `utilizationBps` is a non-negative safe integer;
- `remainingMinor` is a safe signed integer;
- dates are coerced at the boundary;
- category information is an explicit response subshape derived from a shared schema;
- cursor payloads are decoded and parsed, never asserted.

The API may return the fixed alert policy as `{ thresholdsBps: [8000, 10000] }` so the frontend
does not duplicate policy constants.

## 7. API surface

All routes are authenticated and session-scoped. API-key authentication remains rejected until a
specific budget scope is designed.

### `GET /api/v1/budgets`

Query:

- optional opaque `cursor`;
- `limit`, default 50, maximum 200;
- optional `includeArchived`, default false.

Order by `createdAt ASC, id ASC`; the opaque cursor contains those values. The response contains:

- current IST `month`;
- `computedAt`;
- alert policy;
- overview totals across all effective budgets;
- paginated budget-progress items;
- `pageInfo`.

Each item includes category name/icon/color/archive state, configuration, derived progress, and
links IDs. Archived configurations appear only when requested and have no active progress/alerts.
An archived category makes the item ineffective even if the budget record itself was not archived.

### `PUT /api/v1/budgets/:categoryId`

- requires `Idempotency-Key`;
- body: `{ limitMinor }`;
- creates, updates, or restores the current user's budget for that category;
- verifies the category belongs to the user and has `kind = 'expense'`;
- returns the resulting budget configuration;
- writes `budget.upsert` to the immutable audit log with before/after configuration metadata;
- uses the existing idempotency service so concurrent identical requests produce one effect.

The endpoint does not alter transactions or balances. A new mid-month budget includes eligible
spending from the start of the month, which the UI explains before saving.

### `PATCH /api/v1/budgets/:budgetId/archive`

- requires `Idempotency-Key`;
- user-scoped and recoverable;
- sets `isArchived = true`;
- returns the archived configuration for safe idempotent replay;
- writes `budget.archive` to the audit log.

Restoration happens through `PUT` on the category.

### Errors

Add domain errors/codes only where existing generic errors are insufficient:

- `budget.category_must_be_expense`;
- normal not-found behavior for an unknown/other-user category or budget;
- standard validation problems for malformed money, IDs, cursors, and headers.

Do not expose whether another user owns a referenced entity.

## 8. Service and transaction boundaries

Controllers:

- parse shared schemas and `Idempotency-Key`;
- get `userId` only from `@CurrentUser()`;
- call one service/mutation method;
- map replay status.

Services:

- own expense-category validation and archive/restore rules;
- orchestrate configuration, audit, and idempotency;
- never receive HTTP request/response types.

Repositories:

- are the only layer using Drizzle;
- take `userId` first;
- use one bounded grouped query for current-month progress;
- parse DB rows through shared/internal zod schemas.

Upsert/archive run through `IdempotencyPostgresService.execute`, with the configuration write and
audit record in its transaction. Nothing slow or external runs in that transaction.

## 9. Threshold-alert flow

Policy version 1 uses 80% and 100%.

1. A worker-only cron runs daily at 08:00 IST.
2. It reuses the existing posted-transaction user discovery path and enqueues one BullMQ job per
   user with deterministic ID `budget-alerts:{userId}:{IST-date}:v1`.
3. The processor calculates live current-month progress using the same repository method as the
   API.
4. For each effective budget, it identifies every reached threshold without an event row.
5. Inside one short `withTxn`, it locks the budget row, inserts missing event markers, and enqueues
   one `budget_alert` outbox entry for the highest newly reached threshold.
6. The notification worker drains the outbox outside the transaction.

Examples:

- first observed at 86% → record 80%, enqueue one 80% alert;
- later observed at 104% → record 100%, enqueue one 100% alert;
- first observed at 104% → record 80% and 100%, enqueue only one 100% alert;
- reversal drops to 70%, then spending returns to 85% → no duplicate 80% alert that month;
- next month → thresholds are eligible again.

The outbox payload is strictly parsed and contains budget/category IDs, safe category name,
month, threshold basis points, spent paise, and limit paise. It never contains transaction
descriptions, account data, or tags.

The logging notification adapter must be changed to log only routing/event metadata, not spread
the financial payload into logs. Real ntfy/Telegram delivery is not part of this module unless
review explicitly expands the scope.

## 10. Anticipated backend file map

Create:

- `packages/shared/src/budget.ts`
- `apps/api/src/common/db/schema/budget.ts`
- `apps/api/src/budgets/budgets.module.ts`
- `apps/api/src/budgets/budget.controller.ts`
- `apps/api/src/budgets/budget.service.ts`
- `apps/api/src/budgets/budget.repository.ts`
- `apps/api/src/budgets/budget-mutation.service.ts`
- `apps/api/src/budgets/budget-alert.service.ts`
- `apps/api/src/budgets/budget-alert.queue.ts`
- `apps/api/src/budgets/budget-alert.processor.ts`
- `apps/api/src/budgets/budget-alert-schedule.service.ts`
- unit and integration tests beside these files;
- one generated additive migration under `apps/api/drizzle/`.

Modify:

- `packages/shared/src/index.ts`
- `packages/shared/src/errors/codes.ts`
- `apps/api/src/common/db/schema/index.ts`
- `apps/api/src/common/errors/` for the expense-category domain error;
- `apps/api/src/common/logging/events.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/worker.ts`
- `apps/api/src/reports/reports.module.ts` only if required to expose the existing user-discovery
  path;
- `apps/api/src/notifications/logging-notification-adapter.ts` and its tests;
- OpenAPI registration/generated client artifacts via `pnpm gen:client`;
- `docs/backend/BACKEND.md`.

Do not change ledger mutation paths, deployment files, or existing migrations.

## 11. Implementation sequence after approval

- [ ] Add failing shared-contract and integer-ratio tests.
- [ ] Add schema definitions and generate the additive migration.
- [ ] Add failing repository integration tests for exact-category, IST, status, and transfer rules.
- [ ] Implement user-scoped budget configuration and live progress queries.
- [ ] Implement idempotent upsert/archive with audit records.
- [ ] Add list/upsert/archive endpoints and RFC 7807 coverage.
- [ ] Add alert-event reconciliation, outbox enqueue, queue, processor, and schedule.
- [ ] Remove financial payloads from stub notification logs.
- [ ] Regenerate the typed client and verify OpenAPI tenancy probes.
- [ ] Update backend architecture documentation.
- [ ] Run the complete quality gate.

## 12. Verification plan

Unit tests:

- IST month boundaries, including UTC timestamps near midnight;
- exact 80% and 100% boundaries;
- over-limit signed remaining amount;
- safe basis-point arithmetic near supported maximum amounts;
- fixed-clock job IDs and policy versioning;
- highest-new-threshold selection.

Integration tests against fresh PostgreSQL:

- only posted, non-transfer expenses in the exact category are counted;
- income, pending/reversed/reversal rows, transfer legs, other categories, and other users are
  excluded;
- parent and child categories are not aggregated together;
- upsert creates, updates, and restores exactly one row per user/category;
- income categories are rejected;
- archived categories are ineffective;
- cross-tenant reads/mutations return no information;
- 5 or more concurrent identical upserts produce one configuration/audit effect;
- 5 or more concurrent alert jobs produce one event per threshold and one outbox message;
- reversals immediately change progress but do not duplicate alert events;
- alert job retry after a forced failure converges safely;
- every integration/e2e suite ends with `assertInvariants()`.

Operational checks:

- inspect `EXPLAIN (ANALYZE, BUFFERS)` for the current-month aggregate;
- use existing user/category/occurred-at indexes first;
- add an index only if representative plans prove it necessary;
- confirm logs contain no alert payload, descriptions, amounts, or category names;
- confirm queue shutdown and retry behavior.

Required final gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm verify:migrations
```

## 13. Decisions requested in review

Please approve or change these before implementation:

1. monthly, current-month-only budgets;
2. exact-category semantics with no descendant aggregation;
3. fixed 80% and 100% thresholds;
4. no rollover, Uncategorized, overall, or historical budgets in the first release;
5. live bounded ledger aggregation instead of the nightly rollup;
6. alert-event/outbox production now, with real external delivery handled separately.

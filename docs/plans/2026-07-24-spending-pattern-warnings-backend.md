# Spending Pattern Warnings — Backend Proposal

**Status:** Proposal only. Do not implement until this document is reviewed and approved.

**Goal:** Add an explainable backend that periodically identifies a small set of unusual spending patterns from a user's own transaction history and serves them from a fast, user-scoped API.

**Implementation order:** Backend first. The frontend proposal is in
[`2026-07-24-spending-pattern-warnings-frontend.md`](./2026-07-24-spending-pattern-warnings-frontend.md)
and must wait for the backend contracts and generated client.

## 1. Product boundary

This feature is a personal-history signal, not:

- fraud detection or an account-security alert;
- a budget, forecast, credit assessment, or financial recommendation;
- a real-time transaction monitor;
- a merchant-recognition system;
- a reason to update, reverse, or delete a ledger entry.

Warnings must use neutral language such as “higher than your recent pattern.” Severity
describes statistical strength only; it must never imply fraud.

The first version detects:

1. an overall short-term spending spike;
2. a category-level spending spike;
3. an unusually large individual expense.

The first version deliberately excludes recurring-payment detection, merchant inference,
user-configurable thresholds, external notifications, charts, forecasts, and machine-learning
services. Those require separate product decisions after the initial rules have been observed.

## 2. Repository findings that constrain the design

- Money is stored as positive integer paise in `transactions.amount_minor`. Every calculation
  and stored threshold remains an integer; ratios cross API boundaries as integer basis points.
- Only `status = 'posted'`, `type = 'expense'`, and `transfer_group_id IS NULL` rows are eligible.
  This excludes income, transfer legs, reversed originals, and compensating reversal entries.
- `occurred_at` is a UTC timestamp, but user-facing windows are calendar windows in
  `Asia/Kolkata`. Window bounds must use the existing IST utilities and be passed to indexed
  timestamp predicates.
- Categories are nullable. Null is a valid “Uncategorized” subject rather than a reason to drop
  an expense.
- Existing monthly rollups only cover month totals and are refreshed for the current and previous
  month. They cannot answer rolling-window or individual-expense questions, so analysis should
  aggregate raw rows in PostgreSQL and persist a warning snapshot.
- Request handlers must never scan months of transactions. The worker computes warnings; the API
  reads the persisted snapshot.
- The notification outbox is for external delivery. This page does not need outbox entries in the
  initial version, avoiding notification fatigue and an unrelated delivery-contract change.
- Transaction descriptions are sensitive and inconsistent. They are neither detector input nor
  stored warning evidence nor telemetry.

## 3. Research basis

The proposed rules favor robust, interpretable statistics:

- The [NIST outlier guidance](https://itl.nist.gov/div898/handbook/eda/section3/eda35h.htm)
  describes median/MAD-style labeling and cautions that distribution assumptions can make
  outlier tests misleading.
- NIST's [measures of scale](https://itl.nist.gov/div898/handbook/eda/section3/eda356.htm)
  explains why median absolute deviation and interquartile range are less affected by tail
  extremes than standard deviation.
- The [NIST box-plot rule](https://www.itl.nist.gov/div898/handbook/prc/section1/prc16.htm)
  defines inner and outer IQR fences. This proposal uses the more conservative outer fence for
  individual expenses.
- PostgreSQL provides
  [ordered-set aggregates](https://www.postgresql.org/docs/current/sql-expressions.html) and
  [window functions](https://www.postgresql.org/docs/current/functions-window.html), allowing
  the database to calculate discrete percentiles and window totals without loading the full
  history into application memory.

These sources support the method, not the exact product thresholds. The thresholds below are
initial calibration values and need approval and later tuning from observed false positives.

## 4. Detection contract

All runs use a single fixed `asOf` instant. Tests inject it; production supplies the worker's
start time. The analysis boundary is the start of the current IST calendar date, so every
comparison uses completed days and does not compare a partial morning with full earlier days.
Calendar boundaries are derived in IST, converted to UTC once, and then used in queries.

### 4.1 Overall spending spike

Compare the 7 completed IST calendar days ending at the analysis boundary with the median of the
8 preceding, non-overlapping 7-day windows.

Eligibility:

- at least 6 non-zero baseline windows; and
- at least 20 eligible baseline expenses.

Trigger:

- current spend is at least 150% of the baseline median; and
- current spend exceeds the median by at least `300_000` paise (₹3,000).

Only one overall warning can be active for an analysis run.

### 4.2 Category spending spike

For each category, including Uncategorized, compare the 30 completed IST calendar days ending at
the analysis boundary with the median of the 6 preceding, non-overlapping 30-day windows.

Eligibility for that category:

- at least 4 non-zero baseline windows;
- at least 12 eligible baseline expenses; and
- at least 3 expenses in the current window.

Trigger:

- current category spend is at least 150% of its baseline median; and
- the absolute increase is at least `200_000` paise (₹2,000).

Return at most 4 category warnings, ordered by excess paise. Do not fall back to an across-category
baseline when a category has insufficient history; that would compare unlike spending patterns.

### 4.3 Unusually large expense

For each candidate expense in the 30 completed IST calendar days ending at the analysis boundary,
compare its amount with the preceding 180 days of eligible expenses in the same category. A
category needs at least 12 baseline transactions.

Use PostgreSQL's discrete percentiles so quartiles remain integer paise:

```text
IQR = Q3 - Q1
threshold = max(500_000 paise, 3 × median, Q3 + 3 × IQR)
```

The `Q3 + 3 × IQR` term is the conservative outer-fence rule. A candidate triggers when its
amount is at least the threshold. Return at most 5 recent candidates.

The baseline excludes the candidate itself and anything later than it. This prevents the value
being tested from inflating its own baseline.

### 4.4 Severity and result limits

- `attention`: any warning that meets its trigger.
- `high`:
  - overall/category spend is at least 200% of baseline and the excess is at least
    `1_000_000` paise (₹10,000); or
  - an individual expense is at least twice its calculated threshold.

The API returns a maximum of 10 active warnings from one run: 1 overall, 4 category, and 5 large
expenses. Severity must always be accompanied by evidence; it is not an independent risk score.

### 4.5 Cold start and stale data

An empty array is ambiguous, so the response also contains analysis coverage:

- `learning`: not enough history for every detector;
- `ready`: one or more detectors were eligible, whether or not warnings exist;
- `stale`: the last successful analysis is older than 36 hours;
- `unavailable`: no successful analysis exists yet because processing failed.

Coverage includes `computedAt`, `sourceThrough`, `historyStart`, eligible detector kinds, and the
eligible baseline-expense count. Insufficient history is a successful result, not a 404.

## 5. Persistence model

Use additive schema changes only.

### `spending_warning_analysis_state`

One row per user:

- `user_id` primary key and user foreign key;
- `detector_version` integer;
- `status` (`learning`, `ready`);
- `computed_at`;
- `source_through`;
- nullable `history_start`;
- `baseline_expense_count`;
- `eligible_kinds` JSONB, parsed through a strict shared zod schema.

The API derives `stale` from `computed_at`; it is not persisted.

### `spending_warnings`

- `id` UUID primary key;
- `user_id` user foreign key;
- `fingerprint` text;
- `kind` (`overall_spend_spike`, `category_spend_spike`, `unusually_large_expense`);
- `severity` (`attention`, `high`);
- `status` (`active`, `dismissed`, `resolved`);
- nullable `category_id` and `transaction_id` foreign keys;
- `window_start` and `window_end`;
- strict, versioned `evidence` JSONB;
- `detector_version`;
- `first_detected_at`, `last_detected_at`;
- nullable `dismissed_at`, `resolved_at`;
- unique index on `(user_id, fingerprint)`;
- list index on `(user_id, status, last_detected_at DESC, id DESC)`.

Every warning repository method takes `userId` first and includes it in its filter. Foreign-key
references provide navigation only; they never replace tenant filtering.

### Warning episodes and fingerprints

Fingerprints make retries converge on one result:

- overall: detector version + kind + current IST week start;
- category: detector version + kind + category/Uncategorized + current IST month;
- large expense: detector version + kind + transaction ID.

A run upserts current findings, preserves dismissal for the same episode, and marks formerly
active findings as resolved when they are no longer produced. A dismissed warning stays hidden
for that episode, but a genuinely later episode can appear. Upsert, resolution, and analysis-state
update happen in one `withTxn` call.

Late or backdated entries and category reassignment are handled by recomputation. No warning path
changes the ledger.

## 6. Shared contracts

Add zod schemas and derive all exported types from them:

- `SpendingWarningKindSchema`;
- `SpendingWarningSeveritySchema`;
- discriminated evidence schemas for the three warning kinds;
- `SpendingWarningSchema`;
- `SpendingWarningAnalysisSchema`;
- `ListSpendingWarningsQuerySchema`;
- `SpendingWarningPageSchema`;
- `DismissSpendingWarningResponseSchema`.

Evidence contains only what the UI needs:

- integer current/baseline/threshold/delta paise;
- integer ratio basis points;
- integer sample/window counts;
- window timestamps;
- category ID/name when applicable;
- transaction ID when applicable.

No description, raw tags, account identifiers, or free-form detector payload crosses the
boundary. JSONB rows leaving the repository are parsed, not asserted.

## 7. API

### `GET /api/v1/spending-warnings`

Query:

- optional `kind`;
- optional `severity`;
- optional opaque `cursor`;
- `limit`, default 20, maximum 50.

Order active warnings by `lastDetectedAt DESC, id DESC`. The opaque cursor contains those two
values, providing stable keyset pagination without offset. The response contains `items`,
`pageInfo`, and the analysis coverage object.

The controller parses the query, obtains `userId` from `@CurrentUser()`, calls one service method,
and returns the shared response type.

### `POST /api/v1/spending-warnings/:warningId/dismiss`

- requires `Idempotency-Key`;
- is scoped to the current user;
- moves an active warning to `dismissed`;
- repeated identical requests return the original result;
- writes an immutable audit event such as `spending_warning.dismissed`;
- does not accept a reason or any monetary fields.

There is no synchronous “refresh now” endpoint in the first version. A page request must not start
an analytical scan.

## 8. Queue and scheduling

Add a dedicated `spending-warnings` BullMQ queue:

1. a worker-only cron runs daily at 05:00 IST;
2. it reuses the existing posted-transaction user discovery path rather than introducing a second
   unscoped repository method;
3. it enqueues one job per user;
4. job ID is deterministic: user ID + IST date + detector version;
5. jobs use bounded attempts with exponential backoff;
6. the worker process starts and closes the processor alongside existing workers.

The processor asks the service to analyze one user. Repository queries perform grouped sums and
discrete percentile calculations in PostgreSQL across an approximately 210-day bounded range.
Application code receives compact aggregate rows, not a hydrated transaction history.

Logs contain event name, detector version, user ID, duration, counts, and failure metadata. They
must not contain descriptions, amounts, evidence payloads, category names, or transaction data.

The monthly rollup job runs at 02:00 IST. Warnings run later for operational separation, although
their calculations deliberately read eligible raw transactions rather than rollup JSON.

## 9. Anticipated backend file map

Exact names may change during implementation if the compiler or generated migration requires it,
but responsibility should remain separated as follows.

Create:

- `packages/shared/src/spending-warning.ts`
- `apps/api/src/common/db/schema/spending-warning.ts`
- `apps/api/src/spending-warnings/spending-warnings.module.ts`
- `apps/api/src/spending-warnings/spending-warnings.controller.ts`
- `apps/api/src/spending-warnings/spending-warnings.service.ts`
- `apps/api/src/spending-warnings/spending-warnings.repository.ts`
- `apps/api/src/spending-warnings/spending-warnings.detector.ts`
- `apps/api/src/spending-warnings/spending-warnings.queue.ts`
- `apps/api/src/spending-warnings/spending-warnings.processor.ts`
- `apps/api/src/spending-warnings/spending-warnings-schedule.service.ts`
- unit and integration tests beside those files;
- one generated additive migration under `apps/api/drizzle/`.

Modify:

- `packages/shared/src/index.ts`
- `apps/api/src/common/db/schema/enums.ts`
- `apps/api/src/common/db/schema/index.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/worker.ts`
- `apps/api/src/common/logging/events.ts`
- audit action schema, if actions are currently closed;
- generated OpenAPI client output via `pnpm gen:client`;
- `docs/backend/BACKEND.md`.

No deployment files or existing ledger migrations should be changed.

## 10. Implementation sequence after approval

- [ ] Add failing pure detector tests with a fixed clock and explicit IST boundary cases.
- [ ] Add shared zod contracts and contract tests.
- [ ] Add schema definitions and generate the additive migration.
- [ ] Implement aggregate repository queries with `userId` first.
- [ ] Implement the pure rule evaluation and bounded result selection.
- [ ] Implement atomic warning reconciliation and analysis-state persistence.
- [ ] Add queue, worker processor, deterministic scheduling, and safe shutdown.
- [ ] Add the paginated list and idempotent dismiss endpoints.
- [ ] Regenerate the OpenAPI client and confirm the tenancy probe includes both routes.
- [ ] Update backend architecture documentation.
- [ ] Run the complete quality gate.

## 11. Verification plan

Unit tests:

- exact threshold boundaries in integer paise and basis points;
- median/discrete-quartile behavior for odd and even sample counts;
- minimum history and non-zero-window gates;
- result limits, ordering, severity, and fingerprints;
- IST day/month boundaries and fixed-clock determinism;
- learning, ready, stale, and no-warning states.

Integration tests against fresh PostgreSQL:

- only posted, non-transfer expenses are included;
- income, pending rows, transfer legs, reversed originals, and reversal entries are excluded;
- Uncategorized is handled independently;
- every read and mutation is tenant isolated;
- backdated inserts and category reassignment converge on the next run;
- at least 5 concurrent identical jobs create no duplicate warnings;
- at least 5 concurrent dismiss attempts produce exactly one state transition and one audit effect;
- dismissed episodes remain suppressed and later episodes can return;
- every suite ends with `assertInvariants()`.

Operational verification:

- inspect `EXPLAIN (ANALYZE, BUFFERS)` for the bounded aggregate queries with representative data;
- use existing transaction indexes first;
- add a partial/covering index only if measured plans prove it necessary;
- verify job retry after a forced mid-run failure;
- verify logs contain no transaction descriptions or evidence.

Required final gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm verify:migrations
```

## 12. Decisions requested in review

Please approve or change these before implementation:

1. the 7-day overall and 30-day category windows;
2. the 150% plus ₹3,000/₹2,000 trigger floors;
3. the 180-day, same-category large-expense baseline and ₹5,000 minimum threshold;
4. the daily 05:00 IST cadence and 36-hour stale boundary;
5. dismissal lasting for the current warning episode;
6. the initial exclusion of external notifications and user-configurable thresholds.

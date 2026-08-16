# Recurring transaction reconciliation

## Context

`recurring_rules` (`apps/api/src/recurring/recurring-materialize.service.ts`) posts a templated transaction on schedule (01:00 IST) with `source: "recurring"` — it's a prediction ("Claude will charge ₹2000 today"), not a confirmation that money actually moved. Separately, external automation (n8n, already live in the user's real deployment) authenticates with an API key (`transactions:write` scope) and calls `POST /v1/transactions` to log the transaction it parses from the bank's debit-alert email — the ground truth.

These two paths don't know about each other today. If a recurring rule posts ₹2000 for Claude on the 1st, and n8n's email parser also posts ₹2000 for the same real-world charge, the ledger double-counts it — same account debited twice for one real transaction.

This document designs the fix: when an API-key-sourced transaction comes in, check whether it corresponds to an already-posted recurring transaction, and reconcile automatically where the match is unambiguous, only bothering the user when it isn't. Implementation has not started — see "Suggested implementation order" at the end.

**Agreed scope (from prior discussion):**

- Clean match (same account, exact amount, occurred within a few days of the recurring posting) → **auto-reconcile silently**, no notification. This is expected to be the common case — the whole point is not to nag on every occurrence of a bill that behaves exactly as configured.
- Anything else (multiple equally-good candidates, or a same-account/same-window transaction whose amount doesn't match) → **flag for the user**, surfaced on the recurring page as a yes/no ("is this the same charge?") — this is the exception path, not the default one.
- This plan is **backend only**, matching this repo's established `worktree-<feature>-backend` / `-frontend` split (backend lands on `main` first; a frontend branch follows separately to build the recurring-page UI). The backend still needs to expose enough (a list-pending endpoint, a resolve endpoint) for that later frontend work to consume.
- Scoped to API-key-sourced transactions only (n8n's actual use case). A session-authenticated (human, via the web UI) transaction never triggers auto-reversal of anything — silently reversing a transaction a human just typed in because it happens to resemble a recurring rule would be a surprising, unwanted side effect. `source: "api"` is the trigger signal.

## Why reversal, not suppression

The tempting-looking alternative — "just don't insert the second transaction" — breaks the ledger's core invariant (`AGENTS.md`: append-only, corrections are compensating reversal entries, never silent drops) and throws away real data (n8n's transaction carries the actual bank description/date, which is more accurate than the recurring rule's templated guess). Instead: **always insert the incoming API transaction as normal money movement.** When it's later found to duplicate a recurring posting, reconcile by **reversing the earlier, speculative recurring-sourced transaction** — using the reversal mechanism (`TransactionService.reverse`, `transaction.controller.ts`'s existing `POST /:transactionId/reverse`) that already exists in this codebase for exactly this "undo a posted transaction, in the ledger, on the record" purpose. The API-sourced transaction (real bank truth) becomes canonical; the recurring one is cleanly reversed rather than having ever pretended to not exist.

This also means: no schema change to `transactions` itself, no new "suppressed"/"duplicate" transaction status, no touching `recurring_rules`' own scheduling (`nextRunAt`/`claimRun` are untouched — reconciliation only ever acts on _already-posted individual transactions_, after the fact).

## Prior art being reused, not reinvented

The credit-card bill statement reconciliation module (`apps/api/src/bills/`) already solved a structurally identical problem — "does this ledger transaction match this external record, and if not, is it missing or ambiguous" — and it's a real, shipped, tested feature (unlike `docs/SALARY-MODULE.md`'s `post_and_match`/`expect_and_confirm` design, which is unimplemented vocabulary from a different, unbuilt module). This plan copies its shape instead:

- `apps/api/src/bills/statement-matcher.ts`'s `matchStatementRows`/`rankRow` — rank candidates by exact `type`+`amountMinor` match and `calendarDayDistance` (from `packages/shared/src/credit-card-cycle.ts`), take the best-distance tie-set, classify as `matched` (unique best match) / `ambiguous` (tie) / `missing_from_ledger` (no candidate) — is the direct template for the new matcher below.
- `apps/api/src/bills/bill-reconciliation.service.ts`'s `updateRow`/`acknowledgeExtra` — a system flags an ambiguous/mismatched record, the user resolves it with a real follow-up action, idempotency-keyed via `IdempotencyPostgresService` — is the direct template for the new resolve endpoint.
- `apps/api/src/transactions/transaction.repository.ts:152` `findReconciliationCandidates(userId, accountId, cycleStart, cycleEndExclusive)` — the exact shape of query needed to fetch candidate transactions for an account in a date range; the new repository method is a sibling of this, filtered to `source = 'recurring'`.

## Data model (new Drizzle migration, `0018_<generated-name>.sql`)

New enums in `apps/api/src/common/db/schema/enums.ts`:

```ts
export const recurringReconciliationStatusEnum = pgEnum("recurring_reconciliation_status", [
  "auto_matched", // clean match, recurring txn already reversed, informational only
  "ambiguous", // 2+ equally-good recurring candidates tied on amount+date
  "amount_mismatch" // exactly one same-account/same-window recurring candidate, but amount differs
]);
export const recurringReconciliationResolutionEnum = pgEnum("recurring_reconciliation_resolution", [
  "confirmed_duplicate", // user says yes, same charge -> reverse the chosen recurring txn
  "confirmed_distinct" // user says no, unrelated -> leave both transactions standing
]);
```

Add `"recurring_reconciliation_pending"` to the existing `notificationTypeEnum` (`apps/api/src/common/db/schema/enums.ts`, alongside `budget_alert | monthly_report | balance_drift | goal_achieved`).

New table `apps/api/src/common/db/schema/recurring-reconciliation.ts` → `recurringReconciliations`:

```ts
{
  id: uuid, primary key, default random
  userId: text, references user(id)
  incomingTransactionId: uuid, references transactions(id), NOT NULL, unique   // the API-sourced txn that triggered this check
  recurringRuleId: uuid, references recurring_rules(id), nullable             // set when there's exactly one candidate (auto_matched, amount_mismatch); null for ambiguous
  recurringTransactionId: uuid, references transactions(id), nullable         // ditto — the specific recurring-sourced txn, when unambiguous
  candidateRecurringTransactionIds: uuid[], not null, default '{}'            // always populated: all candidates considered, for audit/debugging and for the ambiguous case's "pick one" resolve step
  status: recurringReconciliationStatusEnum, not null
  resolution: recurringReconciliationResolutionEnum, nullable
  resolvedAt: timestamptz, nullable
  createdAt: timestamptz, not null
  updatedAt: timestamptz, not null
}
```

Indexes: unique on `incomingTransactionId`; `(userId, status)` for the pending-list query (`resolution IS NULL` rows only ever have `status IN ('ambiguous', 'amount_mismatch')`, since `auto_matched` rows are written already-resolved/informational).

No changes needed to `transactions` or `recurring_rules` tables themselves.

## Wiring the trigger: `source: "api"` is currently dead code

Research finding worth flagging up front: `transactionSourceEnum` already has `"api"` as a value, and `request.authMethod: "session" | "api-key"` is already set by `AuthGuard` (`apps/api/src/auth/auth.guard.ts:77,110`) — but nothing threads it through. `TransactionController.create` (`transaction.controller.ts:52`) never reads `request.authMethod`, and `TransactionService.create` (`transaction.service.ts:42`) never passes a `source` to the repository, so it silently defaults to `"manual"` (`transaction.repository.ts`'s `create()` default) even when called by an API key. Today, every n8n-inserted transaction is indistinguishable from a human typing it into the web UI.

Fix: `TransactionController.create` takes `@Req() request: Request`, computes `source: request.authMethod === "api-key" ? "api" : "manual"`, and passes it to `TransactionService.create(userId, input, idempotencyKey, source)`. `TransactionService.create` threads it to `this.transactions.create(userId, input, idempotencyKey, tx, undefined, source)` (the repository method already accepts this positional param — `recurring-materialize.service.ts:93-108` already calls it with `"recurring"`). This is the one existing-code change everything else depends on, since `source === "api"` is the sole trigger condition for running reconciliation at all.

## Matching (pure function, mirrors `statement-matcher.ts`)

New file `apps/api/src/recurring/recurring-reconciliation-matcher.ts`:

```ts
const RECONCILIATION_WINDOW_DAYS = 3; // bank posting delay slack; not a per-rule config in v1

type RecurringCandidate = Readonly<{
  transactionId: TransactionId;
  ruleId: RecurringRuleId;
  accountId: AccountId;
  type: TransactionType;
  amountMinor: number;
  occurredAt: Date;
}>;

type MatchResult =
  | Readonly<{ outcome: "no_match" }>
  | Readonly<{
      outcome: "auto_matched";
      recurringTransactionId: TransactionId;
      recurringRuleId: RecurringRuleId;
    }>
  | Readonly<{ outcome: "ambiguous"; candidateTransactionIds: readonly TransactionId[] }>
  | Readonly<{ outcome: "amount_mismatch"; candidateTransactionIds: readonly TransactionId[] }>;

function matchIncomingTransaction(
  incoming: Readonly<{
    accountId: AccountId;
    type: TransactionType;
    amountMinor: number;
    occurredAt: Date;
  }>,
  candidates: readonly RecurringCandidate[]
): MatchResult;
```

Logic (two tiers over the same `candidates` list, which the repository already scoped to same-account + `source = 'recurring'` + `status = 'posted'` + within `RECONCILIATION_WINDOW_DAYS`):

1. `sameWindow = candidates.filter(c => c.type === incoming.type && calendarDayDistance(c.occurredAt, incoming.occurredAt) <= RECONCILIATION_WINDOW_DAYS)` — the repository query should already guarantee this, but keep the function pure and self-contained (testable without a DB).
2. `exact = sameWindow.filter(c => c.amountMinor === incoming.amountMinor)`
   - `exact.length === 1` → `auto_matched`
   - `exact.length > 1` → `ambiguous` with all of `exact`'s ids
3. `exact.length === 0`:
   - `sameWindow.length >= 1` → `amount_mismatch` with all of `sameWindow`'s ids (amount ignored — this is precisely the "same account, same rough date, but the number is off" case the user asked to be flagged, e.g. a subscription price hike or a failed-then-retried charge)
   - `sameWindow.length === 0` → `no_match` (the overwhelmingly common case for ordinary transactions unrelated to any recurring rule — no side-table row gets written for this, to avoid noise)

Filtering `status = 'posted'` on the candidate query (reusing the existing `transactionStatusEnum`) is what naturally excludes already-auto-matched recurring transactions from being matched again — once one is reversed, it's no longer `'posted'` and drops out of every future candidate query for free, no separate "claimed" bookkeeping needed. Candidates already referenced by an _unresolved_ `recurringReconciliations` row (ambiguous/amount_mismatch, pending) should also be excluded, so the same recurring transaction doesn't get flagged twice against two different incoming transactions — filter those out in the repository query (`recurringTransactionId NOT IN (select recurring_transaction_id from recurring_reconciliations) AND id != ALL(select unnest(candidate_recurring_transaction_ids) from recurring_reconciliations)`).

## Repository work

`apps/api/src/transactions/transaction.repository.ts`: new method `findUnreconciledRecurringCandidates(userId, accountId, occurredAt, windowDays, tx?)` — sibling of the existing `findReconciliationCandidates` (line 152), filtered to `source = 'recurring' AND status = 'posted'`, date range `occurredAt ± windowDays`, and excluding any transaction id already referenced by a `recurringReconciliations` row (join or subquery against the new table).

New file `apps/api/src/recurring/recurring-reconciliation.repository.ts` → `RecurringReconciliationRepository`:

- `create(userId, row, tx)` — insert a `recurringReconciliations` row.
- `findPending(userId)` — `status IN ('ambiguous','amount_mismatch') AND resolution IS NULL`, for the future frontend's list view.
- `findById(userId, id, tx?)`.
- `resolve(userId, id, resolution, tx)` — sets `resolution`, `resolvedAt`.

## Service work

**Refactor `TransactionService.reverse`** (`transaction.service.ts:148`) to extract its `withTxn` body into a `private reverseInTx(userId, transactionId, tx): Promise<Transaction>` that does the existing find-posted → `createReversal` → `markReversed` → balance delta → audit sequence. `reverse()` becomes a thin wrapper: `withTxn(this.db, (tx) => this.reverseInTx(userId, transactionId, tx))` plus its existing idempotency-replay catch block. This lets the reconciliation flow below reverse a transaction **and** write its own bookkeeping row in one atomic transaction, instead of two separate commits that could get out of sync if the process crashes in between — consistent with `AGENTS.md`'s "every money write is one Postgres transaction" rule.

New file `apps/api/src/recurring/recurring-reconciliation.service.ts` → `RecurringReconciliationService.reconcileIncoming(userId, incoming: Transaction): Promise<void>`:

1. Fetch candidates via `findUnreconciledRecurringCandidates`.
2. Run `matchIncomingTransaction`.
3. `no_match` → return, no-op.
4. `auto_matched` → `withTxn`: call the transaction service's `reverseInTx(userId, recurringTransactionId, tx)`, insert a `recurringReconciliations` row (`status: "auto_matched"`, `resolution` left null — it's already resolved by construction, no user action needed, the field is just unused here), audit record `recurring.reconcile.auto_matched`. No notification.
5. `ambiguous` / `amount_mismatch` → `withTxn`: insert the `recurringReconciliations` row (no reversal — nothing happens to the ledger until a human says yes), write a `notification_outbox` row (`type: "recurring_reconciliation_pending"`, payload `{ reconciliationId, incomingTransactionId, status }`), audit record.

**Wire into `TransactionService.create`**: after the existing `withTxn` that inserts the incoming transaction commits, if `source === "api"`, call `this.reconciliation.reconcileIncoming(userId, transaction)` in a `try/catch` that logs on failure rather than throwing — the real transaction must never be rolled back or fail to return to the caller just because reconciliation had a hiccup, mirroring how `RecurringMaterializeService.materialize()`'s per-rule loop (`recurring-materialize.service.ts:62`) already catches-and-logs rather than propagating. This is a deliberate, brief window where an unreconciled duplicate can be visibly double-posted for the few milliseconds between the two commits — acceptable and self-correcting, not worth blocking the response for.

## API surface (new controller, `apps/api/src/recurring/recurring-reconciliation.controller.ts`, registered in `recurring.module.ts`)

```
GET  /v1/recurring/reconciliations?status=pending     list ambiguous/amount_mismatch rows awaiting resolution (session auth only — this is a human-facing review queue, not something n8n calls)
POST /v1/recurring/reconciliations/:id/resolve        body: { resolution: "confirmed_duplicate" | "confirmed_distinct", chosenRecurringTransactionId?: string }
                                                        Idempotency-Key header, via IdempotencyPostgresService (same pattern as bill-reconciliation.service.ts's updateRow/acknowledgeExtra)
```

`chosenRecurringTransactionId` is required (and validated against `candidateRecurringTransactionIds`) when resolving an `ambiguous` row with `confirmed_duplicate` — the ambiguous case by definition has more than one tied candidate, so the human has to pick which one was actually superseded; omit it for `amount_mismatch` (single candidate, already known) or any `confirmed_distinct` resolution.

`RecurringReconciliationService.resolve(userId, id, resolution, chosenRecurringTransactionId, idempotencyKey)`:

- Load the row, reject if already resolved (`EntityNotFoundError`-style, or a new `ReconciliationAlreadyResolvedError`) or if the row's `status` doesn't match the request shape (e.g. `chosenRecurringTransactionId` supplied for a non-ambiguous row).
- `confirmed_duplicate` → `withTxn`: reverse the resolved recurring transaction (`reverseInTx`), update the row's `resolution`/`resolvedAt`, audit record.
- `confirmed_distinct` → `withTxn`: just update `resolution`/`resolvedAt`, audit record. No reversal — both transactions stand.

## packages/shared additions

New file `packages/shared/src/recurring-reconciliation.ts`, exported via `index.ts`:

- `RecurringReconciliationStatusSchema = z.enum(["auto_matched", "ambiguous", "amount_mismatch"])`
- `RecurringReconciliationResolutionSchema = z.enum(["confirmed_duplicate", "confirmed_distinct"])`
- `RecurringReconciliationSchema` — `id, userId, incomingTransactionId, recurringRuleId?, recurringTransactionId?, candidateRecurringTransactionIds, status, resolution?, resolvedAt?, createdAt, updatedAt`
- `ResolveRecurringReconciliationSchema = z.object({ resolution: RecurringReconciliationResolutionSchema, chosenRecurringTransactionId: RecurringTransactionIdSchema.optional() })`
- `RecurringReconciliationIdSchema` (uuid brand, matching the existing `RecurringRuleIdSchema`/`TransactionIdSchema` convention)

New error classes in `apps/api/src/common/errors/`: `ReconciliationAlreadyResolvedError`, `InvalidReconciliationResolutionError` (e.g. missing/invalid `chosenRecurringTransactionId` for an ambiguous row) — each needs a `code` added to `packages/shared/src/errors/codes.ts`'s `ErrorCodes` array, per the existing convention.

## Tests

- **Unit — matcher** (`recurring-reconciliation-matcher.test.ts`): exact single match → `auto_matched`; two same-amount candidates → `ambiguous`; one candidate, different amount → `amount_mismatch`; wrong account/type/outside-window candidates excluded entirely → `no_match`; zero candidates → `no_match`.
- **Unit — service** (mocked repositories): `auto_matched` calls `reverseInTx` and writes an `auto_matched` row, no notification enqueued; `ambiguous`/`amount_mismatch` write a row + notification, no reversal; `no_match` touches neither.
- **Integration** (real Postgres via testcontainers, following this repo's existing `test:integration` service-level-only convention — no new HTTP test harness):
  - Recurring rule materializes a transaction; an API-sourced transaction for the same account/amount lands within the window → exactly one `posted` transaction remains for that charge, the recurring one is `reversed`, a `recurringReconciliations` row exists with `status: "auto_matched"`.
  - Two recurring rules with identical amount/account/date both post; one matching API transaction arrives → `ambiguous` row with both candidate ids, neither original transaction touched, a `notification_outbox` row is enqueued.
  - Recurring posting exists, API transaction arrives same account/window but different amount → `amount_mismatch` row, both transactions stand.
  - `POST /resolve` with `confirmed_duplicate` on an `amount_mismatch` row → reverses the recurring transaction, row marked resolved; called twice with the same `Idempotency-Key` → replay, no double reversal (mirrors the existing idempotency test pattern in `bill-reconciliation.service.test.ts`/integration).
  - `POST /resolve` with `confirmed_duplicate` on an `ambiguous` row missing `chosenRecurringTransactionId` → rejected; with a `chosenRecurringTransactionId` not in `candidateRecurringTransactionIds` → rejected.
  - A session-authenticated (non-API-key) transaction that happens to match a recurring posting → no reconciliation row at all, both transactions stand untouched (confirms the `source === "api"` gate).
  - `pnpm verify:migrations` passes against the new `0018` migration.

## Suggested implementation order

1. Migration 0018 (enums + `recurring_reconciliations` table) + `packages/shared` schemas.
2. Wire `source: "api"` through the controller/service (small, independently mergeable, immediately fixes the dead-code enum value even before reconciliation exists).
3. `TransactionRepository.findUnreconciledRecurringCandidates` + the pure matcher + its unit tests.
4. `TransactionService.reverse` → `reverseInTx` extraction (no behavior change, just a refactor — its own test coverage should stay green unmodified).
5. `RecurringReconciliationRepository` + `RecurringReconciliationService.reconcileIncoming`, wired into `TransactionService.create`.
6. `recurring-reconciliation.controller.ts` (list + resolve), errors, module registration.
7. Integration tests end-to-end; `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm verify:migrations`.
8. Follow-up (separate `worktree-recurring-reconciliation-frontend` branch, after this merges to `main`): recurring page section listing pending reconciliations with yes/no actions, wired to `GET/POST /v1/recurring/reconciliations*`.

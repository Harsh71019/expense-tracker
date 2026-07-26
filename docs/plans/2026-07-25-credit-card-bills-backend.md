# Credit Card Bills — Backend Implementation Plan

> This plan implements the backend portion of
> [`2026-07-24-credit-card-bills-design.md`](./2026-07-24-credit-card-bills-design.md).
> The design remains the source of truth for product intent; this document makes the
> implementation sequence, file changes, transaction boundaries, concurrency rules, and test
> gates explicit.

**Goal:** Add statement-cycle configuration for credit-card accounts, generate one immutable bill
per cycle from the ledger, reconcile an uploaded issuer CSV against that cycle, and allow
idempotent partial/full payment only after reconciliation.

**Architecture:** A new `BillsModule` owns bill generation, statement staging/reconciliation, and
the payment gate. Shared request/response contracts live in `packages/shared`. CSV parsing happens
in the existing worker process through a dedicated BullMQ queue. A bill payment remains a normal
two-leg transfer, with only the destination/card leg tagged by `billId`. Bill totals and payment
state are derived from ledger rows; no second mutable money total is introduced.

**Current migration baseline:** `apps/api/drizzle/0005_wide_gertrude_yorkes.sql`. The generated
migration for this work should therefore be the next ordered migration (currently expected to be
`0006_<generated-name>.sql`; use the number produced by drizzle-kit).

---

## 1. Non-negotiable invariants

- All monetary values are positive integer paise. Use the existing shared money schemas/utilities;
  never divide/multiply display strings in the API.
- No existing transaction amount, type, account, or occurrence date is updated. Reversing a bill
  payment uses the existing compensating transfer reversal.
- Bill payment validation, both account balance changes, both ledger inserts, both audit records,
  the bill tag, and the idempotency result must commit atomically through `withTxn`.
- Every user-data repository method takes `userId` first and filters by it. Statement rows carry a
  denormalized `userId` so row reads/patches do not depend on an unscoped lookup.
- Controllers parse all params/query/body/header data with shared zod schemas and obtain `userId`
  only from `@CurrentUser()`.
- File validation and CSV parsing happen before money transactions. CSV parsing runs in the worker,
  never in the request cycle.
- Statement-row writes are chunked to at most 200 rows per database transaction.
- Every HTTP mutation requires an `Idempotency-Key`, including configuration, statement upload,
  reconciliation-row changes, acknowledgement, reconciliation, and payment.
- New paths must be registered in the hand-maintained OpenAPI registry and covered by the generated
  tenancy probe/e2e suite.

---

## 2. Clarifications required for a safe implementation

These points refine underspecified parts of the design without changing its product intent.

### 2.1 Cycle calendar rules

- `statementDay` and `dueDay` accept integers 1–31.
- If a month has fewer days, clamp to that month's last calendar day. A configured day of 31
  therefore runs on 28/29 February and 30 April.
- Store cycle boundaries as UTC-midnight `Date` values representing IST calendar dates, matching
  `parseExplicitDate(..., "YYYY-MM-DD")`.
- A cycle is represented by inclusive calendar dates `cycleStart` and `cycleEnd`. Ledger queries
  implement this as `[cycleStart, dayAfter(cycleEnd))` so the whole statement day is included.
- `cycleEnd` is the clamped statement date. `cycleStart` is one calendar day after the previous
  clamped statement date.
- `dueDate` is the first clamped `dueDay` strictly after `cycleEnd`: in the same month when possible,
  otherwise in the following month.
- Creating or changing card configuration seeds `nextStatementAt` to the next statement date on or
  after the current IST calendar day. Already-generated bills never change when configuration
  changes.

### 2.2 Bill amount

`amountDueMinor` is a cycle snapshot, not a mutable balance:

```text
max(0, posted expenses - posted non-payment income)
```

- Include only ledger rows owned by the user and card account inside the cycle window.
- Include `status = "posted"` only. Reversed originals and compensating reversal documents do not
  contribute to a new bill.
- Exclude transactions with `billId IS NOT NULL`; those are payments allocated to an older bill and
  must not reduce the next cycle's purchases.
- Ordinary untagged income on the card (refunds/credits) reduces the cycle amount.
- Keep a zero-amount bill row for a generated cycle. This preserves the cycle history, but payment
  is unnecessary and must be rejected as already settled.

This rule should be added to the design document during implementation if product behavior changes
after real statement fixtures are evaluated.

### 2.3 Derived payment state

For a bill:

- `paidMinor` is the sum of card-side transactions where `userId`, `billId`, `accountId`, `type =
"income"`, and `status = "posted"` match.
- `remainingMinor = max(0, amountDueMinor - paidMinor)`.
- `paymentStatus` is `unpaid` when `paidMinor = 0`, `partial` when
  `0 < paidMinor < amountDueMinor`, and `paid` when `remainingMinor = 0`.
- Reversing a transfer marks the original card-side income leg `reversed`, so it automatically
  falls out of `paidMinor`. The reversal leg does not need a `billId`.

### 2.4 Statement matching

Persist `parsedType` on each statement row in addition to date, amount, and description. Matching
on amount alone could pair a refund with a purchase of the same value.

Automatic matching is deterministic and one-to-one:

1. Candidate ledger rows must belong to the same user/card/cycle and have the same `type` and
   `amountMinor`, with the statement date within ±1 IST calendar day.
2. Rank candidates by absolute calendar-day distance (same day before ±1 day).
3. Auto-match only when there is one best candidate and that transaction is not the best candidate
   for another row.
4. No candidate produces `missing_from_ledger`; tied/shared candidates produce `ambiguous`.
5. A partial unique index on `(uploadId, matchedTransactionId)` where the match is non-null enforces
   one ledger transaction per statement row within an upload.
6. Manual override still validates ownership, account, cycle, direction, and amount before setting
   `matchedTransactionId`.

The hard gate passes only when every statement row is matched or explicitly acknowledged. A
malformed row cannot be matched and therefore requires explicit acknowledgement. Extra ledger
transactions are warnings and can be marked reviewed, but do not block reconciliation in this
version.

### 2.5 Active statement upload

Only one upload is active for a bill. Retrying with a new file/mapping marks the previous upload
inactive and creates a new active upload in one transaction. Historical uploads/rows remain for
auditability; they are not used by reconciliation. Add a partial unique index that permits only one
active upload per bill.

---

## 3. Target API contracts

Nest controllers use `@Controller("v1/...")`; clients call `/v1/...`, while the deployed HTTP path
is `/api/v1/...` through the app's global prefix/proxy.

| Method  | Client path                                      | Request                            | Response                    | Idempotent |
| ------- | ------------------------------------------------ | ---------------------------------- | --------------------------- | ---------- |
| `PATCH` | `/v1/accounts/{accountId}/credit-card-config`    | `CreditCardConfigInput`            | `Account`                   | yes        |
| `GET`   | `/v1/bills`                                      | `ListBillsQuery`                   | `BillPage`                  | n/a        |
| `GET`   | `/v1/bills/{billId}`                             | —                                  | `BillDetail`                | n/a        |
| `POST`  | `/v1/bills/{billId}/statement`                   | multipart CSV + mapping            | `BillStatementUpload`       | yes        |
| `GET`   | `/v1/bills/{billId}/statement/rows`              | cursor + limit + optional status   | `BillStatementRowPage`      | n/a        |
| `PATCH` | `/v1/bills/{billId}/statement/rows/{rowId}`      | match override or acknowledgement  | `BillStatementRow`          | yes        |
| `POST`  | `/v1/bills/{billId}/statement/acknowledge-extra` | transaction ID + acknowledged      | `BillReconciliationSummary` | yes        |
| `POST`  | `/v1/bills/{billId}/statement/reconcile`         | empty body                         | `BillDetail`                | yes        |
| `POST`  | `/v1/bills/{billId}/pay`                         | source account, amount, occurredAt | `BillPaymentResult`         | yes        |

Response status conventions:

- Create-like first execution: `201`; idempotent replay: `200` plus
  `Idempotency-Replayed: true`.
- Updates/reconciliation/payment: `200`; replays include `Idempotency-Replayed: true`.
- Ownership failures return the same `404` as a missing resource.
- Invalid state, unresolved reconciliation, and overpayment return RFC 7807 `409`.
- Validation/file errors return RFC 7807 `422`.

---

## 4. Shared schema and type work

### Files

- Create `packages/shared/src/bill.ts`
- Create `packages/shared/src/bill.test.ts`
- Modify `packages/shared/src/account.ts`
- Modify `packages/shared/src/account.test.ts` (create if it does not exist)
- Modify `packages/shared/src/transaction.ts`
- Modify `packages/shared/src/transaction.test.ts`
- Modify `packages/shared/src/index.ts`
- Modify `packages/shared/src/errors/codes.ts`

### Required schemas

Add branded/validated IDs:

- `CreditCardBillIdSchema`
- `BillStatementUploadIdSchema`
- `BillStatementRowIdSchema`

Add account configuration:

- `CreditCardConfigInputSchema`: `{ statementDay, dueDay }`, integers 1–31.
- `CreditCardConfigSchema`: input plus `nextStatementAt`.
- Extend `CreateAccountSchema` with optional `creditCardConfig`, then use
  `superRefine`: required for `credit_card`, forbidden for every other type.
- Extend `AccountSchema` with optional `creditCardConfig`.

Add bill models:

- `BillReconciliationStatusSchema`: `awaiting_statement | reconciled`.
- `BillPaymentStatusSchema`: `unpaid | partial | paid`.
- `CreditCardBillSchema`: stored bill fields plus derived `paidMinor`, `remainingMinor`, and
  `paymentStatus`.
- `BillDetailSchema`: bill, account summary, active upload, reconciliation counts, and extra-ledger
  summary.
- `ListBillsQuerySchema`: optional `accountId`, optional reconciliation/payment status filters,
  cursor, limit default 50/max 200.
- `BillPageSchema` with existing `PageInfoSchema`.

Add statement models:

- `BillStatementUploadStatusSchema`: `pending | staged | failed`.
- `BillStatementUploadSchema`, including `active`, row stats, and timestamps.
- `BillStatementRowMatchStatusSchema`: `matched | missing_from_ledger | ambiguous`.
- `BillStatementRowSchema`: raw row, optional parsed row, match state, acknowledgement, and optional
  matched transaction ID.
- `ListBillStatementRowsQuerySchema` and `BillStatementRowPageSchema`.
- `UploadBillStatementMetadataSchema`: column mapping. The bill determines the account.
- `UpdateBillStatementRowSchema`: exactly one action—set/clear a manual transaction match or toggle
  acknowledgement.
- `AcknowledgeExtraTransactionSchema`.
- `BillReconciliationSummarySchema`.

Add payment:

- `PayCreditCardBillSchema`: `fromAccountId`, positive `amountMinor`, `occurredAt`.
- `BillPaymentResultSchema`: updated bill detail plus the existing `TransferSchema`.
- Extend `TransactionSchema` with optional `billId`; do not add `billId` to public
  `CreateTransactionSchema` or `CreateTransferSchema`, because arbitrary callers must not tag
  ledger rows as bill payments.

Export every schema and every `z.infer` type from `packages/shared/src/index.ts`. Tests cover all
conditional account-config validation, cursor defaults/limits, positive integer money, and
date/type coercion.

---

## 5. Database schema and generated migration

### Files

- Modify `apps/api/src/common/db/schema/account.ts`
- Modify `apps/api/src/common/db/schema/enums.ts`
- Create `apps/api/src/common/db/schema/credit-card-bill.ts`
- Create `apps/api/src/common/db/schema/bill-statement.ts`
- Modify `apps/api/src/common/db/schema/transaction.ts`
- Modify `apps/api/src/common/db/schema/index.ts`
- Generate `apps/api/drizzle/0006_<generated-name>.sql`
- Generate/update `apps/api/drizzle/meta/*`

### Account columns

Add nullable integer `statementDay`, nullable integer `dueDay`, and nullable timezone timestamp
`nextStatementAt`. Add a database check constraint requiring either all three columns or none, and
requiring day values between 1 and 31. Application validation additionally restricts them to
credit-card accounts.

### `credit_card_bills`

Columns:

- `id`, `userId`, `accountId`
- `cycleStart`, `cycleEnd`, `dueDate`
- `amountDueMinor`
- reconciliation `status`
- `createdAt`, `updatedAt`

Indexes/constraints:

- unique `(userId, accountId, cycleEnd)` for cron idempotency;
- `(userId, dueDate, id)` for list/cursor pagination;
- `(userId, accountId, cycleEnd)` for account/cycle reads;
- positive-or-zero `amountDueMinor`;
- FK to account and user.

### `bill_statement_uploads`

Columns:

- `id`, `userId`, `billId`, `filename`, `fileHash`, `mapping`
- `status`, `active`
- `statsTotal`, `statsMatched`, `statsMissing`, `statsAmbiguous`, `statsAcknowledged`
- `acknowledgedExtraTransactionIds` as a UUID array (or JSONB validated by zod if drizzle UUID
  arrays prove awkward)
- `createdAt`, `updatedAt`

Indexes/constraints:

- partial unique `billId` where `active = true`;
- unique `(userId, billId, fileHash)`;
- `(userId, billId, createdAt)`.

### `bill_statement_rows`

Columns:

- `id`, `userId`, `uploadId`, `rowNumber`, `raw`
- nullable parsed date/amount/type/description
- nullable `matchedTransactionId`
- `matchStatus`, `acknowledged`, `createdAt`, `updatedAt`

Indexes/constraints:

- unique `(uploadId, rowNumber)`;
- partial unique `(uploadId, matchedTransactionId)` where non-null;
- `(userId, uploadId, id)` for row cursor pagination;
- FK to upload, user, and matched transaction.

### `transactions.bill_id`

Add nullable UUID `billId` with an FK to `credit_card_bills` and a partial index. Use lazy
`AnyPgColumn` references if necessary to break the Drizzle module cycle, then prove generation and
runtime schema loading with `pnpm migrate:generate` and integration bootstrap.

Run:

```bash
pnpm migrate:generate
pnpm verify:migrations
```

Inspect generated SQL. Do not hand-edit it to compensate for an incorrect Drizzle schema; fix the
schema and regenerate before committing.

---

## 6. Reusable cycle and CSV primitives

### Files

- Create `packages/shared/src/credit-card-cycle.ts`
- Create `packages/shared/src/credit-card-cycle.test.ts`
- Create `apps/api/src/common/csv/parse-amount.ts`
- Create `apps/api/src/common/csv/parse-csv-row.ts`
- Create/move their existing tests under `apps/api/src/common/csv/__tests__/`
- Modify imports-module call sites to use the common paths

Implement pure functions for:

- days in an IST calendar month;
- clamping configured day to a real calendar date;
- previous/next statement dates;
- `cycleStart`, `cycleEnd`, `dueDate`, and following `nextStatementAt`;
- inclusive calendar-day distance for matching.

Do not use host-local `Date#getMonth()`/`getDate()`. Reuse `toISTCalendarDate` and explicit UTC
calendar construction, with tests for:

- statement day before/on/after today's date;
- due day in the same vs next month;
- day 29/30/31 across leap February and 30-day months;
- December/January rollover;
- dates around IST/UTC day boundaries.

Move the generic `parseAmount`/`parseCsvRow` primitives out of `imports/` into `common/csv/` so the
bills module does not deep-import another feature module. Keep imports behavior unchanged and run
its existing unit/integration tests after the move.

---

## 7. Repositories and mapping functions

### Files

- Modify `apps/api/src/accounts/account.repository.ts`
- Modify `apps/api/src/transactions/transaction.repository.ts`
- Create `apps/api/src/bills/credit-card-bill.repository.ts`
- Create `apps/api/src/bills/bill-statement.repository.ts`

### Account repository additions

- Create a card with configuration in the existing `create(...)` transaction.
- `findCreditCardById(userId, accountId, tx?)`.
- `updateCreditCardConfig(userId, accountId, config, nextStatementAt, tx)`.
- `claimStatementCycle(userId, accountId, expectedNextStatementAt, nextStatementAt, tx)` using a
  compare-and-swap predicate.
- Worker-only due-card enumeration must follow the existing scheduled-sweep boundary, return
  `userId` with each candidate, and never be reused by request handlers. Every subsequent read/write
  for a candidate is filtered by that `userId`.

### Transaction repository additions

- Accept an internal-only create option `{ billId?: CreditCardBillId }`; write it only for the
  transfer destination leg selected by `TransferService`.
- Preserve `billId` in `TransactionSchema` mapping.
- `summarizeBillableCycle(userId, accountId, start, endExclusive, tx)` using integer SQL aggregates.
- `findReconciliationCandidates(userId, accountId, start, endExclusive)` with only the columns
  needed by the matcher. Include posted, reversed-original, and reversal rows: reconciliation
  describes what was recorded during the cycle, while bill amount derivation separately uses only
  currently posted rows.
- `sumPostedBillPayments(userId, billId, tx?)`.
- `findByIdsForBillReconciliation(userId, transactionIds, accountId, start, endExclusive, tx?)`.

### Bill repository

- `createForClaimedCycle`, `findById`, `findByIdForUpdate`, `findMany`, and
  `markReconciled`.
- `findByIdForUpdate` must lock the bill row (`FOR UPDATE`) for reconciliation/payment state
  transitions.
- List/detail queries return stored fields and derived payment totals without N+1 queries.
- Cursor is `(dueDate, id)` descending, encoded/decoded through a runtime-validated zod payload.

### Statement repository

- Create/supersede active upload, insert rows in chunks, clear rows for a retried parse, mark staged
  or failed, and recompute stats.
- Every method takes `userId` first and includes it in its direct filter.
- Row pagination uses `(id)` or `(rowNumber, id)` and a validated cursor.
- Manual match update is conditional on the active upload and unresolved bill.
- Reconciliation transition checks the counts in the same transaction as `markReconciled`.

Every database row leaving a repository is parsed through its matching shared schema/mapping
function; no assertions of raw database results.

---

## 8. Account configuration service and endpoint

### Files

- Modify `apps/api/src/accounts/account.service.ts`
- Modify `apps/api/src/accounts/account-mutation.service.ts`
- Modify `apps/api/src/accounts/account.controller.ts`
- Modify account controller/service tests
- Create `apps/api/src/common/errors/invalid-account-type.error.ts`
- Add error tests

Changes:

1. Account creation accepts and persists `creditCardConfig` atomically with the account and its
   idempotency record.
2. Add `AccountMutationService.updateCreditCardConfig(...)`, implemented with
   `IdempotencyPostgresService.execute`.
3. Validate the account is owned, active, and `type === "credit_card"`.
4. Compute/reseed `nextStatementAt` outside the database transaction; write configuration plus
   audit entry inside the idempotency transaction.
5. Existing bills are untouched.
6. Add `PATCH /v1/accounts/:accountId/credit-card-config`.

Add `account.invalid_type` (or a bills-prefixed equivalent selected consistently) to
`ErrorCodes`. The error is a non-retryable `409`, routed through the existing problem+json filter.

---

## 9. Bill generation worker cron

### Files

- Create `apps/api/src/bills/bill-generation.cron.ts`
- Create `apps/api/src/bills/__tests__/bill-generation.cron.test.ts`
- Modify `apps/api/src/common/logging/events.ts`

At a fixed daily time in `Asia/Kolkata`:

1. Return immediately unless `SERVICE_ROLE === "worker"`.
2. Read due configured cards.
3. For each card, compute the cycle entirely before entering the transaction.
4. In `withTxn`, compare-and-swap `nextStatementAt`; if the claim loses, return without effect.
5. Aggregate billable ledger rows, insert the bill, advance the account's next statement date, and
   append an audit record in that same transaction.
6. The unique `(userId, accountId, cycleEnd)` index is the second idempotency guard.
7. Log a stable success/failure event without descriptions, filenames, or monetary statement data.
8. Catch/log per-card failures so one card does not abort the sweep.

No network call or CSV work occurs inside this transaction.

---

## 10. Statement queue, parser, and reconciliation service

### Files

- Create `apps/api/src/bills/bill-statements.queue.ts`
- Create `apps/api/src/bills/bill-statements.processor.ts`
- Create `apps/api/src/bills/bill-reconciliation.service.ts`
- Create `apps/api/src/bills/statement-matcher.ts`
- Create focused unit tests
- Modify `apps/api/src/worker.ts`
- Modify `apps/api/src/main.ts` to expose the queue in Bull Board
- Modify `apps/api/src/common/logging/events.ts`

### Upload request

1. Validate extension, MIME, non-empty buffer, and 5 MB cap using the existing import constants.
2. Confirm bill ownership and that it is not already reconciled.
3. Hash bytes before any database transaction.
4. Use the mutation idempotency key to create/supersede the active upload and record the response.
5. After the idempotency transaction commits, enqueue a deterministic job whose `jobId` is the
   upload ID and whose payload includes the user/bill/upload IDs, mapping, and base64 file bytes.
   Perform this enqueue for both a first execution and an idempotent replay. That closes the
   commit-before-enqueue crash window: retrying the same HTTP request re-enqueues the same job ID
   without creating a second upload.
6. Return the `pending` upload immediately.

### Worker parse

1. Decode and parse CSV outside a transaction with `csv-parse/sync` and
   `z.array(z.record(z.string(), z.string()))`.
2. Enforce 50,000 rows before staging.
3. Parse every row with the common CSV primitive, retaining malformed rows as acknowledged=false
   unresolved rows.
4. Load the bill and candidate ledger rows through user-scoped repositories.
5. Run the pure one-to-one matcher outside a transaction.
6. Delete only rows belonging to this user/upload from an earlier interrupted attempt.
7. Insert at most 200 rows per transaction. Each chunk is retry-safe through
   `(uploadId, rowNumber)` uniqueness/upsert behavior.
8. Mark stats/status `staged` only after all chunks land; mark `failed` on structural parse failure.
9. A retry derives the same rows from the same bytes and cannot create duplicates.

### Manual review and reconciliation

- Manual matching parses and validates the target transaction at runtime, then updates the row and
  stats inside the idempotency transaction.
- Acknowledging a missing/ambiguous row never creates a ledger transaction; it records that the
  discrepancy was consciously accepted.
- Extra-ledger acknowledgement validates the transaction belongs to the card/cycle before updating
  the active upload.
- `reconcile()` locks the bill and active upload, recomputes unresolved counts, and changes
  `awaiting_statement → reconciled` plus an audit entry in one idempotent transaction.
- Reconciliation is monotonic. A reconciled bill cannot accept a replacement upload or row edits.

Add domain errors and error codes for invalid file, statement not ready, unresolved statement, and
already reconciled state. Unit-test status/code/retryability and problem+json mapping.

---

## 11. Atomic payment through the existing transfer path

### Files

- Modify `apps/api/src/transactions/transfer.service.ts`
- Modify `apps/api/src/transactions/transactions.module.ts`
- Modify transfer unit/integration tests
- Create `apps/api/src/bills/bills.service.ts`
- Create `apps/api/src/bills/bill-payment-mutation.service.ts`
- Create payment unit/integration tests
- Create `BillNotReconciledError` and `BillOverpaymentError` plus tests/codes

Refactor `TransferService` without changing the existing `/v1/transfers` behavior:

- Extract an internal `createInTx(userId, input, tx, options)` that performs both balance deltas,
  creates both legs, and writes both audit rows using the caller's transaction.
- `options.toLegBillId` tags only the destination income leg.
- The existing public `create(...)` continues to own `withTxn` and its natural replay behavior.
- Export `TransferService` from `TransactionsModule` so `BillsModule` can inject it; do not
  instantiate or deep-import transaction internals.

`BillPaymentMutationService.pay(...)` uses `IdempotencyPostgresService.execute`:

1. Lock and load the user-owned bill in the idempotency transaction.
2. Require reconciliation status `reconciled`.
3. Require source account exists, is active, is not the card account, and is not a credit-card
   account unless product explicitly allows card-to-card bill payment later.
4. Sum posted payments while the bill row lock serializes competing payments.
5. Reject non-positive remaining amount and any amount above remaining.
6. Call `TransferService.createInTx` with the card as destination and `toLegBillId = bill.id`.
7. Record a bill-specific audit action in addition to the two standard transfer audit rows.
8. Derive and return the updated bill/payment result.
9. Record that result in the idempotency table in the same transaction.

The row lock is essential: two concurrent payments with different keys must not both observe the
same remaining amount. Test both same-key replay and different-key overpayment contention.

---

## 12. Controller, module, OpenAPI, and client generation

### Files

- Create `apps/api/src/bills/bills.controller.ts`
- Create `apps/api/src/bills/bills.module.ts`
- Create controller tests
- Modify `apps/api/src/app.module.ts`
- Modify `apps/api/src/openapi/registry.ts`
- Modify `apps/api/src/openapi/__tests__/openapi.controller.test.ts`
- Regenerate `apps/api/openapi.json`
- Regenerate `apps/web/src/lib/api/generated/schema.d.ts`

Controller rules:

- Parse every UUID, cursor, filter, header, and body.
- Multipart metadata JSON starts as `unknown`, is `JSON.parse`d to `unknown`, then parsed with
  `UploadBillStatementMetadataSchema`.
- Set `Location` and `Idempotency-Replayed` consistently with existing controllers.
- No Drizzle query, calendar calculation, matching, or payment arithmetic in the controller.

Module wiring:

- `BillsModule` imports `AccountsModule`, `TransactionsModule`, `AuditModule`, and
  `IdempotencyModule` only as required by exported providers.
- Add `BillsModule` after accounts/transactions/imports in `AppModule`.
- Register `BillStatementsQueue` with Bull Board and start/close its worker in `worker.ts`.

OpenAPI:

- Register every path and shared schema in `registry.ts`, including multipart media type, required
  idempotency headers, `404`, `409`, `422`, and replay responses.
- Add all mutation paths to the OpenAPI idempotency-header assertion.
- Add bill paths to the core-path assertion.
- Confirm authenticated paths appear in the generated tenancy probe input.

Run `pnpm gen:client` only after the registry and controllers are complete. Commit the generated
OpenAPI JSON and web schema with the backend contract change.

---

## 13. Test matrix

### Shared/unit

- Conditional credit-card account config.
- Cycle math/clamping/rollovers/IST boundary behavior.
- Bill/payment/reconciliation schema boundaries.
- Matcher: exact, ±1 day, direction mismatch, unique closest, tied, duplicate statement rows,
  already-claimed transaction, malformed row.
- Every new domain error.
- Controller zod parsing and response headers.
- Worker guard (`SERVICE_ROLE`) and per-card failure isolation.

### Integration with fresh testcontainers Postgres

- Create `apps/api/test/integration/support/assert-invariants.ts` if the helper is not already
  present when implementation begins. It must verify conservation, transfer pairing, immutable
  monetary fields/reversal relationships, account-balance caches, tenant ownership, and that
  `billId` appears only on eligible card-side transfer legs. Call it at the end of every new or
  modified integration/e2e test as required by `AGENTS.md`.
- Migration boots with all new constraints/indexes.
- Cross-user account, bill, upload, row, candidate transaction, reconciliation, and payment access
  returns no data/effect.
- Account creation/config update persists valid config and rejects non-card accounts.
- Generation across month/year/leap boundaries computes correct cycle and due date.
- Five concurrent generation attempts produce exactly one bill and one audit effect.
- Bill amount includes posted expenses/refunds, excludes reversed rows and prior bill payments.
- Upload queues once per idempotency key; worker retry produces one row per CSV row.
- CSV row limit, MIME, extension, size, malformed structure, and bad mapping failures.
- Automatic and manual matching preserve one-to-one constraints.
- Reconciliation fails with unresolved rows and succeeds after match/acknowledgement.
- Reconciled bills reject upload replacement and row edits.
- Payment creates exactly two transfer legs, adjusts both account balances, tags only the card leg,
  and writes audit/idempotency records atomically.
- Five same-key concurrent payments create one transfer.
- Competing different-key payments cannot overpay the bill.
- Transfer reversal removes the payment from derived `paidMinor`.
- Forced failure after the first balance delta rolls back balances, rows, audit, and idempotency.
- Each integration/e2e test calls `assertInvariants()` before teardown:
  conservation, transfer pairing, append-only fields, and bill-payment tag placement.

### E2E

- Session authentication required on every path.
- Tenancy probe covers every new authenticated route.
- Upload multipart request reaches the controller with expected fields.
- Problem+json status/code for invalid account type, unresolved reconciliation, and overpayment.
- Required idempotency headers and replay headers behave as documented.

### Coverage

The bills/payment/reconciliation code is money-path code and must meet the repository's 90% line
coverage gate. Do not exclude it from coverage.

---

## 14. Implementation sequence and commits

Implement in independently reviewable slices:

1. `feat(shared): define credit card bill contracts and cycle math`
2. `feat(db): add credit card bill and statement schema`
3. `refactor(imports): share csv parsing primitives`
4. `feat(accounts): persist credit card cycle configuration`
5. `feat(bills): generate ledger-derived statement cycles`
6. `feat(bills): stage and reconcile card statements`
7. `refactor(transfers): support atomic tagged transfer legs`
8. `feat(bills): pay reconciled bills atomically`
9. `feat(api): publish credit card bill endpoints`
10. `test(bills): cover tenancy concurrency and ledger invariants`

Do not combine the migration with unrelated deployment changes.

---

## 15. Definition of done

From the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm verify:migrations
pnpm gen:client
pnpm build
```

Additionally confirm:

- `git diff --check` is clean.
- Generated client and OpenAPI artifacts are committed.
- No `console.log`, type escape hatch, unscoped repository query, raw SQL concatenation, or
  unvalidated `JSON.parse` result was introduced.
- No money write bypasses `withTxn`.
- No network/file/CSV work occurs inside a database transaction.
- A reversed bill payment immediately changes the derived bill state without updating the bill's
  monetary fields.

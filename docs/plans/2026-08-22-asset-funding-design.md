# Asset funding from bank transactions — implementation specification

**Status:** Proposed implementation plan

**Audience:** Ledger, assets, reports, recurring, web, migration, and test implementers

**Primary goal:** Represent money moved from a cash account into an owned asset without corrupting cash balances or reporting it as consumption

**Authoritative constraints:** `AGENTS.md`, integer paise, compensating reversals, `withTxn`, tenant-scoped repositories, idempotent mutations, and generated OpenAPI contracts

## 1. Executive decision

Introduce an asset-funding allocation that links one posted bank expense to one
open investment or fixed-deposit asset.

The existing transaction remains the source of truth for cash movement. The
funding allocation adds the economic meaning that the outflow acquired or
increased an asset. It does not edit the transaction's amount, type, account,
date, balance effect, or audit history.

For a ₹5,000 SIP:

```text
Bank cash movement             -₹5,000
Raw cash outflow                ₹5,000
Asset funding                   ₹5,000
Consumption spending                 ₹0
Net-worth effect at funding          ₹0
```

The bank account falls by ₹5,000 and the asset carrying value rises by ₹5,000,
so net worth is conserved before market movement or fees.

This is not:

- a category-only workaround;
- a transfer between two ledger accounts;
- a valuation snapshot;
- a second transaction;
- permission to update a posted monetary field; or
- an automatic claim that every expense in an “Investment” category bought an
  asset.

## 2. Product scope

The complete design covers five user journeys:

1. Link an already-posted eligible expense to an existing asset.
2. Link an already-posted eligible expense while creating a new asset.
3. Capture a new investment from quick add as one atomic transaction + funding
   operation.
4. Remove an incorrect investment classification through a compensating funding
   reversal.
5. Materialize or reconcile a recurring SIP into the same funding model.

The recommended first implementation stops after journeys 1–4 and the required
report/net-worth corrections. Recurring SIPs are a later slice because both
auto-post and manual-reconciliation paths must be correct together.

## 3. Success criteria

The feature is complete only when all of these conditions hold:

1. Linking an existing transaction never changes an account balance.
2. Creating an investment applies exactly one negative account delta.
3. Every funding amount is a positive safe integer in paise.
4. A source transaction funds at most one active asset at a time.
5. Funding correction never deletes an event or updates its monetary fields.
6. All three mutations replay the original result under the same idempotency
   key and reject key reuse with different intent.
7. Concurrent link/close, link/reverse, duplicate link, duplicate create, and
   duplicate removal attempts serialize to one valid state.
8. Raw cash outflow continues to reconcile with account movement.
9. Consumption metrics exclude active fundings; cash-flow metrics do not.
10. Cached rollups are invalidated in the same transaction as a funding change.
11. Net worth adds only active contributions strictly after the latest total
    valuation observation, preventing opening-value double counts.
12. Tenant A can never link Tenant B's asset or transaction.
13. The transaction list, details, asset timeline, reports, dashboard, budgets,
    essential burn, and spending warnings agree on the classification.
14. Reversing the source transaction also removes its funding attribution
    atomically.

## 4. Non-goals

The first release does not:

- split one bank transaction across multiple assets;
- fund one asset from several partial amounts inside a single transaction;
- change `TransactionTypeSchema` or persist `investment` as a transaction type;
- support gold/silver purchases that require quantity and unit-cost accounting;
- support loans or liabilities as funding targets;
- calculate XIRR, tax lots, realized gains, or brokerage fees;
- infer fundings from category names;
- mutate or delete historical valuations;
- move money between two bank accounts;
- import market prices;
- automatically convert all historical “Investment” category transactions; or
- perform a slow report recomputation inside a money transaction.

## 5. Current codebase baseline

Implementation must extend the code that exists now.

| Concern                   | Existing source                                             | Required change                                                        |
| ------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Transaction orchestration | `transactions/transaction.service.ts`                       | Extract a transaction-aware `createInTx` core                          |
| Transaction persistence   | `transactions/transaction.repository.ts`                    | Lock eligible sources and enrich list/detail reads                     |
| Transaction reversal      | `transactions/reverse-transaction-in-tx.ts`                 | Invoke an optional funding-reversal hook                               |
| Account balance           | `accounts/account.repository.ts` and balance assertions     | Reuse unchanged for new investment creation only                       |
| Asset creation            | `assets/asset.service.ts`                                   | Reuse `createInTx` with a derived opening value                        |
| Asset locking             | `assets/asset.repository.ts`                                | Add tenant-scoped open-row `FOR UPDATE` read                           |
| Valuations                | `assets/valuation.repository.ts`                            | Preserve total-value observations; add batch latest reads where needed |
| Net worth                 | `assets/net-worth.service.ts` and dashboard as-of reads     | Add post-valuation active contributions                                |
| Idempotency               | `common/idempotency/idempotency-postgres.service.ts`        | Wrap every HTTP funding mutation                                       |
| Transactions              | `common/db/db-txn.ts`                                       | One shared `DbTx`; no nested top-level transaction                     |
| Audit                     | `audit/audit.repository.ts`                                 | Record funding create/reverse in the same `DbTx`                       |
| Rollup cache              | `reports/monthly-rollup.repository.ts`                      | Add transactional month invalidation and formula version               |
| Dashboard                 | dashboard repository/service and shared schemas             | Separate cash outflow, consumption, and asset funding                  |
| Budgets                   | `budgets/budget.repository.ts`                              | Exclude active funding from consumption spend                          |
| Safety                    | `financial-safety/essential-burn.repository.ts`             | Exclude active funding                                                 |
| Warnings                  | `spending-warnings/spending-warnings.repository.ts`         | Exclude active funding from spend baselines/candidates                 |
| Categories                | category suggestion history and category manager            | Exclude active funding from consumption learning/display               |
| Recurring                 | materializer, occurrence reconciliation, rules              | Later add optional target asset                                        |
| Web                       | transaction, quick-add, assets, reports, dashboard features | Add explicit flows and consistent read states                          |
| OpenAPI                   | `openapi/registry.ts`                                       | Register routes, regenerate typed web client                           |

### 5.1 Important existing behavior

- `AssetService.createInTx` creates both asset metadata and an opening valuation.
- `TransactionService.create` currently opens its own `withTxn` transaction.
- `TransactionService.reverseInTx` delegates to a plain function because
  recurring reconciliation must avoid a Nest dependency cycle.
- Monthly rollups are persisted caches; an existing row is returned without
  recomputation.
- Dashboard short-range queries bypass monthly rollups and aggregate live rows.
- Asset cards currently prefer the latest valuation over the net-worth read
  model, so they would hide post-valuation contributions unless changed.
- Dashboard investment return currently compares latest valuation with opening
  valuation; that is not contribution-adjusted performance.

These facts determine the implementation seams below.

## 6. Domain terminology

- **Source transaction:** the posted expense representing cash leaving an owned
  account.
- **Funding:** the allocation that says the outflow acquired/increased an asset.
- **Funding reversal:** the compensating allocation that cancels a funding.
- **Active funding:** a `posted` funding whose source transaction is still
  posted and which has no paired funding reversal.
- **Raw cash outflow:** every eligible posted expense amount, including asset
  funding.
- **Consumption spending:** a posted non-transfer expense with no active
  funding.
- **Valuation:** a total-value observation for an asset at a specific instant.
- **Carrying value:** latest valuation through an as-of instant plus active
  contributions after that valuation and through the as-of instant.
- **Principal contributed:** sum of active funding amounts; it is not market
  value and not automatically investment return.
- **UI investment mode:** a create-form mode that persists a normal expense plus
  a funding; it is not a new ledger transaction type.

## 7. Accounting invariants

### 7.1 Existing transaction linked to an asset

Given a posted ₹5,000 expense already reflected in HDFC's balance:

```text
Before linking
  HDFC balance delta             -₹5,000
  Raw cash outflow                ₹5,000
  Consumption spending           ₹5,000
  Asset funding                        ₹0

After linking
  HDFC balance delta             -₹5,000  unchanged
  Raw cash outflow                ₹5,000  unchanged
  Consumption spending                 ₹0
  Asset funding                   ₹5,000
  Asset carrying-value delta      ₹5,000
```

Linking performs no account write.

### 7.2 New investment into an existing asset

The composite mutation creates:

1. one normal `expense` transaction;
2. one account balance delta of `-amountMinor`;
3. one posted funding for the exact same amount/date;
4. transaction and funding audit entries; and
5. one affected-month rollup invalidation.

All five effects and the idempotency record commit together or none commit.

### 7.3 New investment and new asset

For a new asset, derive:

- `asset.openedAt = transaction.occurredAt`; and
- `asset.openingValueMinor = transaction.amountMinor`.

`AssetService.createInTx` then records a total-value opening valuation equal to
the contribution at the same instant. The carrying-value rule uses only
fundings strictly later than the latest valuation, so the opening funding is
not added twice.

```text
Opening valuation at 2026-08-22T04:00Z       ₹5,000
Funding at the same instant                  ₹5,000
Post-valuation funding added                     ₹0
Carrying value                               ₹5,000
```

The new-asset funding form does not ask for a second opening amount. If value
differs because of fees or market movement, the user adds a later valuation.

### 7.4 Later valuation

Example:

```text
Opening valuation, 1 Jan                     ₹10,000
Funding, 1 Feb                                ₹2,000
Funding, 1 Mar                                ₹3,000
Carrying value before new valuation          ₹15,000
Manual total valuation, 15 Mar               ₹14,600
Funding, 1 Apr                                ₹1,000
Carrying value after 1 Apr                   ₹15,600
```

The 15 March valuation is assumed to include every holding/contribution at or
before its timestamp. Contributions at exactly the same timestamp are therefore
not added. The comparison is strict `funding.occurredAt > valuation.valuedAt`.

### 7.5 Removing an incorrect classification

Removing the classification:

- inserts a funding reversal;
- updates only lifecycle linkage on the original funding, mirroring transaction
  reversal;
- leaves amount, source transaction, asset, and occurrence date unchanged;
- does not touch the account balance; and
- causes the original outflow to count as consumption again.

The correction restates interpretation for the source transaction's IST month.
`createdAt` still records when the user made the correction.

### 7.6 Reversing the source transaction

A source transaction cannot remain economically funded after it is reversed.
The source reversal operation therefore creates a funding reversal in the same
`DbTx` when an active funding exists.

Result:

```text
Original expense                           -₹5,000 cash
Transaction reversal                       +₹5,000 cash
Original funding                           +₹5,000 asset attribution
Funding reversal                           -₹5,000 asset attribution
Net current effect                               ₹0
```

The funding hook is replay-safe by its one-to-one reversal constraint. It does
not require a separate HTTP idempotency key because it is part of the already
guarded source reversal transaction.

## 8. Eligibility rules

### 8.1 Eligible source transaction

Every link must verify, under lock and inside the mutation transaction:

- same user;
- status is `posted`;
- type is `expense`;
- no `reversalOf` or `reversedBy`;
- no `transferGroupId`;
- positive safe-integer `amountMinor`;
- no active funding already exists; and
- source row still satisfies these rules after any blocked concurrent writer
  completes.

CSV, API, recurring, and manual sources are all eligible if the economic facts
above hold. Imported history does not receive a separate weaker path.

### 8.2 Eligible target asset

Version 1 supports only:

- `investment`; and
- `fixed_deposit`.

The asset must:

- belong to the same user;
- be open at link time; and
- still be open when its locked row is read.

`loan_receivable`, `loan_liability`, `gold`, and `silver` are rejected. Gold and
silver require quantity/unit-cost semantics; loans require disbursement and
repayment semantics rather than a generic asset purchase.

### 8.3 Full-amount allocation

Version 1 requires:

```text
funding.amountMinor = sourceTransaction.amountMinor
funding.occurredAt  = sourceTransaction.occurredAt
```

These values are copied by the service and never accepted from the request
body. Partial and split allocations remain future work.

## 9. Persistence model

### 9.1 New table

Generate an additive Drizzle migration for `asset_fundings`.

| Column           | Type                  | Rule                                          |
| ---------------- | --------------------- | --------------------------------------------- |
| `id`             | UUID PK               | default random UUID                           |
| `user_id`        | text FK               | required tenancy boundary                     |
| `asset_id`       | UUID FK               | required; no cascade delete                   |
| `transaction_id` | UUID FK               | required; source or copied source on reversal |
| `amount_minor`   | bigint number mode    | positive safe integer; immutable              |
| `occurred_at`    | timestamptz           | copied from original source; immutable        |
| `status`         | enum                  | `posted`, `reversed`, `reversal`              |
| `reversal_of`    | UUID self-FK nullable | set only on reversal row                      |
| `reversed_by`    | UUID self-FK nullable | set only on reversed original                 |
| `created_at`     | timestamptz           | insertion time                                |

Do not add `updated_at`. The only permitted update is the original row's
`status/reversed_by` pairing in the compensating reversal transaction.

This mirrors the existing transaction lifecycle: monetary facts are
append-only; lifecycle metadata pairs the immutable original with a newly
inserted compensating row.

### 9.2 Constraints and indexes

The migration must include:

1. `CHECK (amount_minor > 0)`.
2. Lifecycle-shape check:
   - posted: `reversal_of IS NULL AND reversed_by IS NULL`;
   - reversed: `reversal_of IS NULL AND reversed_by IS NOT NULL`;
   - reversal: `reversal_of IS NOT NULL AND reversed_by IS NULL`.
3. `CHECK (reversal_of IS NULL OR reversal_of <> id)`.
4. Partial unique index on `(user_id, transaction_id) WHERE status = 'posted'`.
   This is the exact active source uniqueness guard and permits reclassification
   only after the earlier allocation is reversed.
5. Partial unique index on `reversal_of WHERE reversal_of IS NOT NULL`.
6. Partial unique index on `reversed_by WHERE reversed_by IS NOT NULL`.
7. Read index on `(user_id, asset_id, occurred_at DESC, id DESC)`.
8. Read index on `(user_id, transaction_id)`.

Foreign keys must not cascade-delete any funding, transaction, asset, or audit
history.

The service still validates tenant ownership and state. Database uniqueness is
the final concurrency guard, not a substitute for domain errors.

### 9.3 Active-funding predicate

Define one reusable database predicate/read helper. An active funding is:

```text
asset_fundings.status = 'posted'
AND source transactions.status = 'posted'
AND source transactions.reversal_of IS NULL
AND source transactions.reversed_by IS NULL
```

Every consumption reader must use the same predicate. Do not copy slightly
different ad hoc joins across reports, budgets, warnings, and dashboard code.
A narrowly named helper under `common/db` may build the correlated `NOT EXISTS`
expression; repositories remain the owners of their queries.

### 9.4 Schema ownership

Add:

- `common/db/schema/asset-funding.ts`;
- the new enum in `common/db/schema/enums.ts`;
- exports from the schema index; and
- the generated SQL under `apps/api/drizzle/`.

No application startup code creates or alters the table.

## 10. Shared API contracts

Add `packages/shared/src/asset-funding.ts` and export schemas/types from the
shared barrel.

### 10.1 Funding schemas

```ts
const AssetFundingStatusSchema = z.enum(["posted", "reversed", "reversal"]);

const AssetFundingSchema = z.object({
  id: AssetFundingIdSchema,
  userId: z.string().min(1),
  assetId: AssetIdSchema,
  transactionId: TransactionIdSchema,
  amountMinor: MinorAmountSchema,
  occurredAt: z.coerce.date(),
  status: AssetFundingStatusSchema,
  reversalOf: AssetFundingIdSchema.optional(),
  reversedBy: AssetFundingIdSchema.optional(),
  createdAt: z.coerce.date()
});
```

Add schema refinements matching the database lifecycle-shape constraints.

### 10.2 Transaction summary

Extend `TransactionSchema` additively:

```ts
assetFunding: z.object({
  fundingId: AssetFundingIdSchema,
  assetId: AssetIdSchema,
  assetName: z.string().min(1).max(80),
  assetKind: z.enum(["investment", "fixed_deposit"]),
  amountMinor: MinorAmountSchema
}).optional();
```

Only active funding is exposed. Creation paths that return a plain transaction
may omit this optional field; list/detail reads hydrate it.

### 10.3 Target union

```ts
const ExistingAssetFundingTargetSchema = z.object({
  kind: z.literal("existing_asset"),
  assetId: AssetIdSchema
});

const NewFundedAssetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("investment"),
    name: z.string().trim().min(1).max(80)
  }),
  z.object({
    kind: z.literal("fixed_deposit"),
    name: z.string().trim().min(1).max(80),
    maturityAt: z.string().datetime({ offset: false }).optional(),
    annualRateBps: z.number().int().min(0).max(10_000).optional()
  })
]);

const NewAssetFundingTargetSchema = z.object({
  kind: z.literal("new_asset"),
  asset: NewFundedAssetSchema
});

const AssetFundingTargetSchema = z.discriminatedUnion("kind", [
  ExistingAssetFundingTargetSchema,
  NewAssetFundingTargetSchema
]);
```

The server derives `openedAt` and opening value from the source transaction.

### 10.4 Link-existing input

```ts
const LinkTransactionToAssetSchema = z.object({
  target: AssetFundingTargetSchema
});
```

The request contains no amount, date, transaction type, account id, or user id.

### 10.5 Create-investment input

```ts
const CreateInvestmentTransactionSchema = z.object({
  accountId: AccountIdSchema,
  amountMinor: MinorAmountSchema,
  occurredAt: z.string().datetime({ offset: false }),
  description: z.string().trim().min(1).max(500),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  target: AssetFundingTargetSchema
});
```

The service derives `type: "expense"`. Version 1 does not accept category id in
investment mode; asset funding is the classification. Linking an existing
transaction leaves its current category untouched for audit/history display,
but consumption readers ignore it while funding is active.

### 10.6 Mutation results

Use concrete result schemas suitable for idempotency-record replay:

```ts
const AssetFundingMutationResultSchema = z.object({
  funding: AssetFundingSchema,
  transaction: TransactionSchema,
  asset: AssetSchema
});

const ReverseAssetFundingResultSchema = z.object({
  original: AssetFundingSchema,
  reversal: AssetFundingSchema
});
```

HTTP replay is communicated with the existing `Idempotency-Replayed: true`
header. The stored result itself is identical.

### 10.7 Contribution history

```ts
const AssetActivityItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("valuation"), valuation: ValuationSchema }),
  z.object({
    kind: z.literal("funding"),
    funding: AssetFundingSchema,
    transactionDescription: z.string(),
    accountName: z.string()
  })
]);
```

The endpoint uses cursor pagination on `occurredAt + id` with default 50 and max 200. If merging valuation and funding streams in SQL becomes needlessly complex,
return separate paginated funding and valuation endpoints and merge only the
first bounded pages in the UI. Never load unbounded history.

## 11. REST API

### 11.1 Routes

```http
POST /api/v1/transactions/{transactionId}/asset-funding
POST /api/v1/asset-fundings/investments
POST /api/v1/asset-fundings/{fundingId}/reverse
GET  /api/v1/assets/{assetId}/fundings?cursor=&limit=
```

Every POST requires `Idempotency-Key: <uuid>`.

### 11.2 Route behavior

#### Link existing

`POST /transactions/{transactionId}/asset-funding`:

- path supplies transaction id;
- body supplies existing/new target;
- returns 201 for first create, 200 + replay header for replay;
- sets `Location` to the funding resource; and
- never applies a balance delta.

#### Create investment

`POST /asset-fundings/investments`:

- body supplies cash transaction facts and target;
- persists a normal expense, balance delta, funding, optional new asset/opening
  valuation, audits, invalidation, and idempotency record atomically;
- returns the composite result; and
- never calls the top-level `TransactionService.create` method.

#### Reverse funding

`POST /asset-fundings/{fundingId}/reverse`:

- accepts no amount/date body;
- inserts the compensating funding;
- returns original + reversal; and
- does not reverse the source bank transaction.

### 11.3 Domain errors

Add explicit domain errors mapped by the global problem filter:

| Code                                   | HTTP | Meaning                                        |
| -------------------------------------- | ---- | ---------------------------------------------- |
| `asset_funding.source_not_eligible`    | 409  | source is not a posted standalone expense      |
| `asset_funding.already_linked`         | 409  | source already has an active funding           |
| `asset_funding.not_reversible`         | 409  | funding is not posted or is already reversed   |
| `asset_funding.asset_kind_unsupported` | 422  | target kind is outside v1                      |
| `asset_funding.asset_unavailable`      | 409  | target closed during/ before link              |
| existing entity-not-found              | 404  | tenant-scoped asset/transaction/funding absent |
| existing idempotency conflict          | 409  | key reused with different intent               |

Do not expose whether another tenant owns a supplied id.

### 11.4 OpenAPI

Register all routes, headers, request/response schemas, cursor parameters,
problem responses, and authentication in `openapi/registry.ts`. Run
`pnpm gen:client` and use only generated paths from the web.

Authenticated mutations and reads must appear in the tenancy probe suite.

## 12. Module architecture

```text
Web forms / transaction rows / asset activity
                    │
                    ▼
        AssetFundingController (HTTP only)
                    │
                    ▼
      AssetFundingMutationService
       IdempotencyPostgresService
                    │ same DbTx
                    ▼
          AssetFundingService
       ┌────────────┼──────────────┐
       ▼            ▼              ▼
TransactionService AssetService FundingRepository
   createInTx       createInTx
       │            │              │
       └──── account / valuation / audit / rollup invalidation
```

Create `AssetFundingsModule`. It may import exported services/repositories from:

- `TransactionsModule`;
- `AssetsModule`;
- `ReportsModule`; and
- globally available audit/idempotency modules.

Controllers call one mutation/read service method. Controllers do not touch
Drizzle or decide eligibility.

## 13. Transaction-aware creation refactor

### 13.1 Required seam

Refactor `TransactionService` so top-level create and composite funding create
share this internal/public module API:

```ts
createInTx(
  userId: string,
  input: CreateTransaction,
  source: TransactionSource,
  tx: DbTx,
  options?: Readonly<{ idempotencyKey?: string }>
): Promise<Transaction>
```

The method owns the same work as current create:

1. validate an optional active category and kind;
2. apply exactly one account balance delta;
3. insert the transaction;
4. record the transaction audit;
5. run the API-source created hook when applicable; and
6. return the parsed transaction.

`TransactionService.create` remains the top-level wrapper for the existing
transaction endpoint and calls `withTxn(...createInTx...)`.

### 13.2 Composite idempotency

`AssetFundingMutationService.createInvestment` calls:

```ts
idempotency.execute(
  userId,
  "asset-funding.investment.create",
  key,
  input,
  AssetFundingMutationResultSchema,
  (tx) => fundingService.createInvestmentInTx(userId, input, tx)
);
```

Inside that callback, call `TransactionService.createInTx` with no independent
top-level transaction. The composite idempotency record, transaction, balance
delta, funding, asset/valuation, audits, and invalidation share the same `DbTx`.

Do not call:

- `TransactionService.create`;
- another `withTxn`;
- the transaction controller; or
- a pending-transaction top-level confirmation path.

## 14. Mutation algorithms

### 14.1 Link existing transaction

Inside the idempotency callback:

1. Lock the tenant-scoped transaction row `FOR UPDATE`.
2. Validate source eligibility from the locked row.
3. Resolve target:
   - existing: lock tenant-scoped open asset `FOR UPDATE` and validate kind;
   - new: create asset + opening valuation through `AssetService.createInTx`,
     deriving openedAt/value from the source.
4. Check active funding under the same transaction for a domain-friendly error.
5. Insert posted funding, copying amount/date.
6. Record `asset_funding.create` audit with ids only; do not duplicate raw
   narration.
7. Delete the cached rollup for the source IST month in the same `DbTx`.
8. Return funding + source + asset for idempotency storage.

The partial unique index remains the final guard if two requests pass an
earlier read.

### 14.2 Create investment

Inside the idempotency callback:

1. Parse wire timestamp before entering service logic.
2. Resolve/lock an existing target, or prepare the derived new-asset input.
3. Build a normal `CreateTransaction` with `type: "expense"` and no category.
4. Call `TransactionService.createInTx`.
5. For a new target, call `AssetService.createInTx` using transaction
   amount/date. For an existing target, use its locked row.
6. Insert funding for the created transaction.
7. Record funding audit.
8. Invalidate the transaction's IST month rollup in the same `DbTx`.
9. Return the composite result.

If any step fails, account balance, transaction, asset, valuation, funding,
audits, idempotency record, and cache invalidation all roll back.

### 14.3 Remove classification

Inside the idempotency callback:

1. Resolve the original tenant-scoped funding.
2. Lock source transaction first, then funding row, following the global lock
   order.
3. Require original status `posted` and no existing reversal.
4. Insert a reversal row copying user, asset, transaction, amount, and effective
   occurrence date.
5. Mark only original `status = reversed` and `reversedBy = reversal.id`.
6. Record `asset_funding.reverse` audit.
7. Invalidate the source IST month rollup.
8. Return original + reversal.

No account, transaction monetary field, or valuation is updated.

### 14.4 Source transaction reversal hook

Define a narrow interface alongside transaction reversal:

```ts
export interface TransactionReversalHook {
  onTransactionReversedInTx(
    userId: string,
    original: Transaction,
    reversal: Transaction,
    tx: DbTx
  ): Promise<void>;
}
```

`AssetFundingService` implements it:

- find/lock an active funding by source transaction;
- if absent, return;
- insert and pair a funding reversal exactly once;
- audit it; and
- invalidate the source month.

Bind the hook through a small global module analogous to
`TransactionReconciliationHookModule` so `TransactionsModule` does not import
`AssetFundingsModule` and form a cycle.

Pass the optional hook into every `reverseTransactionInTx` call site:

- `TransactionService`; and
- `RecurringReconciliationService`.

The plain reversal function remains the shared atomic core.

## 15. Concurrency and lock order

Use one documented lock order:

```text
1. source transaction
2. original funding (when present)
3. target asset (when linking an existing asset)
4. account row through existing balance-delta operation
```

New investment creation has no pre-existing source row, so it locks/validates
the target before creating the transaction and relies on existing account
update locking.

Serialization outcomes:

| Race                       | Valid result                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ |
| link vs same link          | one funding; loser replays or receives already-linked                                |
| link vs different asset    | one active target; loser receives conflict                                           |
| link vs source reverse     | link-first creates then reverse hook cancels, or reverse-first makes link ineligible |
| link vs asset close        | close-first rejects link; link-first completes before close                          |
| remove vs remove           | one reversal; loser replays                                                          |
| remove vs source reverse   | one funding reversal; both paths converge through unique `reversal_of`               |
| five creates with same key | one transaction, one balance delta, one funding, one audit set                       |

`withTxn` handles genuine deadlock/serialization retries. Idempotency and unique
constraints handle duplicate business intent.

## 16. Rollup cache and formula versioning

### 16.1 Transactional invalidation

Add:

```ts
MonthlyRollupRepository.invalidate(
  userId: string,
  month: Month,
  tx: DbTx
): Promise<void>
```

It deletes only the derived cache row for that user/month. Derived-cache
deletion is allowed; ledger, funding, valuation, and audit rows remain
append-only.

Call invalidation inside link, create, manual reverse, and source-reversal hook
transactions.

Do not recompute inside `withTxn`. The next `getOrCompute` request recomputes
after commit, and the worker still warms current/previous months.

### 16.2 Existing cached rows

Add `formulaVersion` to monthly rollups and increment the formula to version 2.
The migration gives existing rows version 1. `getOrCompute` recomputes any row
whose version is not the current constant.

This prevents old cached rows from returning zero/default values in new fields
after deployment.

### 16.3 Unaffected months

Only the source transaction's IST month is invalidated. A funding correction
does not evict all monthly reports. A new valuation does not invalidate
consumption rollups.

## 17. Reporting semantics

### 17.1 Additive monthly rollup fields

Keep existing fields for compatibility and add explicit semantics:

| Field                    | Meaning                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `totalExpenseMinor`      | legacy raw posted expense total; keep unchanged            |
| `totalCashOutflowMinor`  | explicit alias of raw posted expense total                 |
| `totalConsumptionMinor`  | posted expense excluding transfer legs and active fundings |
| `totalAssetFundingMinor` | active funding amount for the month                        |
| `byCategory`             | legacy category aggregate retained during migration        |
| `consumptionByCategory`  | new category aggregate excluding active fundings           |
| `byAccount`              | raw net account movement; unchanged                        |
| `formulaVersion`         | current rollup semantics                                   |

Required reconciliation:

```text
totalCashOutflowMinor
  = totalConsumptionMinor
  + totalAssetFundingMinor
  + any explicitly documented non-consumption/non-funding outflow classes
```

For this release, transfer legs are already outside consumption and must not
silently enter the equality. Define one tested query scope for each term.

### 17.2 Savings

```text
savingsMinor = totalIncomeMinor - totalConsumptionMinor

savingsRatePct =
  income > 0
    ? (income - consumption) / income * 100
    : null
```

Zero or negative income returns `null`, displayed as **Not available**, never
`0%` and never a divide-by-zero result.

Savings may be negative. Asset funding is shown separately and is naturally
included in saved money because it is not consumption.

### 17.3 Cash flow

Cash-flow charts continue to reconcile money entering/leaving accounts:

- income series = raw posted income;
- outflow series = raw posted expense; and
- label changes from ambiguous **Spending** to **Cash out**.

Add consumption and funding breakdown fields to the response only if the UI
uses them. Do not replace raw `expenseMinor` with consumption under the same
name.

### 17.4 Consumption consumers

Exclude active funding from:

- monthly/daily spending panels;
- top-spending categories;
- spend mix;
- category report charts;
- category manager monthly-spend summaries;
- budget progress, pacing, and alerts;
- essential-burn history;
- spending warning baselines and large-expense candidates;
- spending change detection inputs;
- transaction “highest expense” and top-spending-category insights; and
- personal category recommendation history after that feature exists.

### 17.5 Cash-obligation consumers

Do not exclude funding from:

- account balances or balance verification;
- transaction export;
- cash-flow forecasting;
- recurring cash-out forecasts;
- credit-card bill payment accounting;
- raw account-flow reports; or
- ledger history/audit screens that show actual movement.

Centralize the distinction so future features must deliberately choose
`raw outflow` or `consumption`.

## 18. Net worth and carrying value

### 18.1 Formula

For each open asset at as-of instant `T`:

```text
latest = latest valuation where valuedAt <= T

carryingValue(T) =
  (latest.valueMinor or 0)
  + sum(active funding amount
        where funding.occurredAt > latest.valuedAt
        and funding.occurredAt <= T)
```

If no valuation exists, sum active fundings through `T`. Existing asset creation
normally guarantees an opening valuation, but reads must remain total.

Liabilities are not fundable in version 1 and retain current signed valuation
behavior.

### 18.2 Shared read service

Create an `AssetCarryingValueService` or repository read model used by:

- `NetWorthService.get`;
- `DashboardRepository.assetsValueMinorAsOf`;
- dashboard investments; and
- asset cards/history responses.

Do not implement four subtly different formulas.

Use batch queries:

1. one latest-valuation query for the asset ids;
2. one grouped active-funding query bounded after each latest valuation; and
3. in-memory safe-integer composition.

Avoid one valuation/funding query per asset. Validate sums with
`parseSafeIntegerMinor` or the shared safe money helpers.

### 18.3 Read-model fields

Extend net-worth asset output additively:

```ts
{
  valueMinor: number,                 // carrying value
  valuationValueMinor: number,
  postValuationFundingMinor: number,
  totalContributedMinor: number,
  valuedAt: Date | null,
  isEstimated: boolean
}
```

`isEstimated` is true when post-valuation funding was added. The UI says
**Estimated from latest valuation + contributions**, not “live market value.”

### 18.4 Return semantics

Do not continue calling:

```text
(latest valuation - opening valuation) / opening valuation
```

“total return” after intermediate contributions. It is mathematically wrong.

For the funded release:

- show carrying value;
- show principal contributed;
- optionally show `carrying value - contributed principal` as an explicitly
  labelled simple gain/loss only when the asset has complete funding lineage;
- otherwise show **Return unavailable**; and
- defer XIRR/cash-flow-adjusted performance to a separate design.

Existing assets with opening value but incomplete historical funding are marked
`limited` rather than given a false return.

## 19. Backend read integration

### 19.1 Transaction reads

Update transaction list/detail reads to hydrate optional funding summary without
N+1 calls.

Preferred approach:

- left join the one active funding and asset in the tenant-scoped list/detail
  queries;
- keep a shared row-to-transaction mapper; and
- preserve plain transaction creation/reversal repository methods where no
  funding summary is needed.

Every join includes `userId` on transaction, funding, and asset ownership.

### 19.2 Asset history

Asset funding history repository methods take `userId` first and use
`occurredAt + id` cursor pagination. Return original/reversal lifecycle clearly.

### 19.3 Live consumption reads

Short-range dashboard, budgets, warnings, safety, and insight queries currently
read transactions directly. Add the shared active-funding exclusion to each
consumption query; updating monthly rollups alone is insufficient.

### 19.4 Diagnostics

Review every repository query containing `type = expense` and classify it in a
code comment/test as:

- cash movement;
- consumption; or
- domain-specific (for example bill payment).

This audit is part of the implementation, not optional cleanup.

## 20. Recurring SIP design

Recurring support is a later phase but must use the same funding service.

### 20.1 Rule contract

Add optional `assetId` to the recurring template. It is valid only when:

- template type is expense;
- target asset kind is investment/fixed deposit; and
- asset is open at create/update time.

The recurring UI labels this **Fund this asset** and does not turn investment
into a new transaction type.

### 20.2 Auto-post rules

Inside the existing materializer `withTxn`:

1. claim the occurrence through existing CAS;
2. create the transaction and balance delta;
3. insert funding for `templateAssetId`;
4. audit both;
5. invalidate the occurrence month; and
6. advance the rule.

All commit together. The created transaction's uniqueness plus one-active-
funding constraint makes retries safe; add an explicit deterministic occurrence
key if the recurring implementation is refactored away from its current atomic
claim guard.

### 20.3 Manual-post/reconciled rules

For `autoPost: false`:

- expected occurrence retains the rule/asset intent;
- when a real transaction is manually or automatically linked to the
  occurrence, create funding inside the reconciliation `DbTx`;
- if the asset closed, do not partially confirm funding; send the occurrence to
  review with a specific error state; and
- source-transaction reversal uses the same funding hook.

Implement auto-post and manual-post support in the same recurring delivery
slice so the rule contract never behaves differently without explanation.

### 20.4 Asset close behavior

Before recurring support ships, define a safe close rule:

- reject closing an asset referenced by an active funding rule with a 409 and
  direct the user to pause/retarget the rule; or
- atomically pause affected rules and surface the consequence.

The recommended version 1 behavior is explicit rejection. Silent failure on the
next materialization is unacceptable.

## 21. Web experience

### 21.1 Visual direction

Extend the current compact treasury interface: elevated surfaces, mono utility
labels, emerald accent, asset-kind medallions, integer-money components, and
restrained drawer motion.

The signature element is a visible **cash → asset** bridge. It explains that the
bank movement is unchanged while its interpretation moves from consumption to
wealth.

No new UI dependency is needed.

### 21.2 Existing transaction row/detail

Eligible unlinked posted expenses show **Mark as investment** in the detail
action area. After link:

```text
₹5,000  HDFC Bank
SIP · NIFTY Index Fund
[Investment · NIFTY Index Fund]
```

The badge includes text and icon, not color alone. Ineligible transactions omit
the action rather than showing a permanently disabled mystery control.

Transaction list rows show the compact badge; detailed eligibility explanation
lives in the detail view.

### 21.3 Link sheet

```text
┌ Mark as investment ───────────────────────────┐
│ ₹5,000 · 22 Aug 2026 · HDFC Bank              │
│ “NACH SIP ABC MUTUAL FUND”                    │
│                                               │
│ This keeps the bank transaction unchanged.    │
│ It will stop counting as day-to-day spending. │
│                                               │
│ Choose asset                                  │
│ [ Mutual funds ]                              │
│ ○ NIFTY Index Fund                            │
│ ○ Flexi Cap Fund                              │
│                                               │
│ [ Fixed deposits ]                            │
│ ○ HDFC FD 2027                                │
│                                               │
│ + Create a new asset                          │
│                                               │
│ [Cancel]                 [Mark as investment] │
└───────────────────────────────────────────────┘
```

Requirements:

- read-only transaction amount/date/account/description;
- searchable existing target list grouped by supported kind;
- inline new-asset branch;
- no editable duplicate amount;
- explicit confirmation copy;
- one UUID idempotency key generated when the sheet mounts;
- key retained across retries and replaced only after success;
- pending state disables duplicate submit; and
- user-facing RFC 7807 error copy.

### 21.4 Create transaction investment mode

The segmented control becomes:

```text
[ Expense ] [ Income ] [ Investment ]
```

`Investment` is local form mode. Submission calls the composite funding route,
which persists `type: expense`.

Fields:

1. amount;
2. source account;
3. description;
4. existing/new asset target;
5. date/time;
6. tags; and
7. save.

Hide category in this mode. Preserve Expense and Income behavior unchanged.

### 21.5 Asset create branch

Supported new-asset cards:

- Investment: name.
- Fixed deposit: name, optional maturity, optional annual rate.

Opened date and opening value are displayed as derived read-only facts:

```text
Opens on 22 Aug 2026
Opening value ₹5,000 from this bank transaction
```

### 21.6 Asset card and activity

Asset cards show:

- carrying value;
- latest valuation date;
- **Estimated** badge when post-valuation funding is included;
- total contributed when lineage is complete; and
- actions for add valuation/history.

Rename valuation-only history to **Activity** and merge bounded events:

```text
22 Aug 2026  +₹5,000  Contribution · HDFC Bank
15 Aug 2026   ₹42,400 Manual valuation
01 Aug 2026  +₹5,000  Contribution · HDFC Bank
```

Funding reversals show **Classification removed** and remain visible.

### 21.7 Reports and dashboard

Monthly report totals become:

```text
CONSUMPTION     INVESTED       CASH OUT        RECEIVED
₹60,000         ₹10,000        ₹70,000         ₹1,00,000
```

The net card says **Net cash flow**, not “saved this month.”

Dashboard savings card:

```text
SAVINGS RATE
40%
₹10,000 invested · ₹30,000 retained as cash
```

When income is zero:

```text
SAVINGS RATE
Not available
No income recorded for this month
```

Monthly spending rhythm, top spending, spend mix, budgets, and warnings use
consumption. Cash-flow chart uses **Income vs cash out**.

### 21.8 Loading, error, and stale states

| State                      | Behavior                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| Assets loading             | sheet skeleton; transaction remains readable                      |
| No eligible assets         | lead directly to inline create                                    |
| Link pending               | preserve entered target and idempotency key                       |
| Link replay                | render normal success; no duplicate toast semantics               |
| Funding summary stale      | invalidate transaction list/detail after mutation                 |
| Rollup recomputing         | existing report loading state; no stale cached row                |
| Net-worth failure          | asset card keeps valuation history and marks estimate unavailable |
| Asset closed during submit | conflict copy with refresh/choose-another action                  |

### 21.9 Accessibility

- all action targets are at least 44 px;
- segmented investment mode uses `aria-pressed` and a visible label;
- asset radio/listbox choices expose name and kind;
- cash → asset explanation is real text, not decorative arrows only;
- badges have accessible names;
- dialogs use existing focus trap/return behavior;
- amount and account summaries are announced once;
- color never distinguishes consumption/funding alone;
- reduced motion disables sheet/badge animation; and
- mobile layouts work at 320 px without horizontal page scroll.

## 22. Frontend data and cache behavior

Add query keys:

- funding root;
- funding by transaction;
- asset funding history; and
- carrying/net-worth reads.

After link/create/reverse settle, invalidate in parallel:

- transactions root;
- affected transaction detail;
- assets and affected asset history;
- net worth;
- dashboard;
- affected monthly rollup;
- budgets;
- financial-safety/diagnostic reads; and
- spending warnings/review surfaces.

The API's transactional rollup invalidation is authoritative. React Query
invalidation only refreshes browser-visible state.

Use generated client methods and shared schemas only. No hand-written fetch,
inline money division, or client-side net-worth formula.

## 23. Security, tenancy, and observability

### 23.1 Tenancy

Every funding repository method takes `userId` first. Every lookup and mutation
filters it, including:

- source transaction;
- target asset;
- original funding;
- reversal;
- history;
- transaction-summary join; and
- rollup invalidation.

Cross-tenant ids resolve as not found. No controller accepts user id.

### 23.2 Audit

Record:

- `asset_funding.create`;
- `asset_funding.reverse`;
- `asset_funding.source_transaction_reversed`; and
- recurring funding events under a clear operation name.

Audit metadata contains bounded ids, operation kind, and algorithm/formula
version where relevant. Do not duplicate transaction description or log full
request bodies.

### 23.3 Logs and metrics

Structured events may include:

- operation;
- replayed boolean;
- supported asset kind;
- duration;
- result status; and
- rollup month.

Do not use descriptions, asset names, account names, amounts, user ids, or raw
idempotency keys as metric labels.

### 23.4 Authorization boundary

No `system*` funding mutation exists. Workers discover recurring rules through
their existing system method, then pass discovered `userId` into tenant-scoped
funding operations.

## 24. Failure modes and recovery

| Failure                               | Impact without design             | Required mitigation                           |
| ------------------------------------- | --------------------------------- | --------------------------------------------- |
| Crash after transaction insert        | orphan cash outflow               | one composite `DbTx`                          |
| Lost HTTP response                    | duplicate funding/audit           | idempotency record + replay                   |
| Two different targets race            | double asset attribution          | source row lock + partial unique active index |
| Asset closes during link              | funding closed target             | locked serialization + eligibility check      |
| Source reverses during link           | asset remains funded without cash | source lock + reversal hook                   |
| Funding removal races source reversal | two reversals                     | funding lock + unique `reversal_of`           |
| Cached month exists                   | stale reports                     | transactional targeted invalidation           |
| Old cache schema deployed             | zeros/new fields stale            | formula version mismatch recompute            |
| Contribution equals valuation time    | double count                      | strict greater-than valuation boundary        |
| Many assets                           | N+1 dashboard                     | batch latest valuation/funding reads          |
| Zero income                           | invalid savings rate              | nullable percentage                           |
| Recurring target closes               | partial recurring write           | precondition/review state; same `DbTx`        |
| Rollup worker down                    | stale cache                       | mutation invalidation + lazy recompute        |

## 25. ADR summary

### ADR-AF-001: Funding is an allocation over the ledger

**Status:** Proposed

**Decision:** Keep the bank transaction canonical and add an asset-funding
record.

**Alternatives:** category-only classification, transfer, or valuation.

**Trade-off:** One extra join is required for consumption reads, but cash and
asset meaning stay independently auditable.

### ADR-AF-002: Mirror compensating transaction lifecycle

**Status:** Proposed

**Decision:** Insert a reversal row and update only lifecycle linkage on the
original. Never update funding amount, asset, transaction, or date.

**Alternatives:** delete the funding; mutate its asset; or use an unpaired
negative amount.

**Trade-off:** Two rows and lifecycle constraints are more verbose, but
corrections remain auditable and active uniqueness can be enforced.

### ADR-AF-003: Total valuations are inclusive observations

**Status:** Proposed

**Decision:** A valuation at time T includes contributions at or before T;
carrying value adds only later active contributions.

**Trade-off:** Same-timestamp intent is resolved by a documented convention
instead of insertion order, preventing nondeterministic double counts.

### ADR-AF-004: Preserve raw outflow and add consumption explicitly

**Status:** Proposed

**Decision:** Existing expense/cash movement remains raw. Add consumption and
asset-funding measures rather than silently changing cash-flow semantics.

**Trade-off:** Response schemas become richer, but reports reconcile and labels
stop overloading “spent.”

### ADR-AF-005: Invalidate, then lazily recompute rollups

**Status:** Proposed

**Decision:** Delete only the affected derived cache row inside the funding
transaction; recompute after commit on demand/worker.

**Trade-off:** The first read after mutation performs aggregation, but money
transactions stay short and stale values cannot leak.

### ADR-AF-006: No funded return percentage without cash-flow adjustment

**Status:** Proposed

**Decision:** Show carrying value and contributions; withhold “total return”
when lineage is incomplete.

**Trade-off:** Less flashy UI, materially more truthful financial reporting.

## 26. Implementation plan by delivery slice

Each slice should be a small, reviewable commit/PR. Do not mix unrelated deploy
changes. Migration and feature code may share this feature series because the
feature requires the additive table.

### Slice 1 — Shared contracts, migration, repository

Files:

- shared asset-funding schemas/tests/barrel;
- schema enum/table/index export;
- generated Drizzle migration;
- funding repository and unit/integration tests.

Work:

1. Define lifecycle schemas/refinements.
2. Generate table, checks, FKs, partial unique constraints, and indexes.
3. Implement tenant-scoped create/find/lock/reverse/pair/history methods.
4. Add shared active-funding SQL predicate.
5. Prove monetary columns have no update/delete repository method.

Acceptance:

- migration applies fresh;
- all values parse through shared schemas;
- one active source uniqueness holds under concurrency; and
- tenant isolation integration tests pass.

### Slice 2 — Atomic link/create/reverse services

Files:

- transaction `createInTx` refactor/tests;
- asset locking method;
- funding service/mutation service/controller/module/errors;
- rollup invalidation;
- audit and idempotency tests.

Work:

1. Extract transaction-aware create without behavior change to existing route.
2. Implement all three idempotent funding mutations.
3. Implement new-asset derivation.
4. Invalidate only affected month in `DbTx`.
5. Register routes/OpenAPI and regenerate client.

Acceptance:

- no nested/top-level transaction in composite create;
- exactly one balance delta;
- all duplicate replays return original result; and
- five-way concurrent tests pass.

### Slice 3 — Source reversal and read models

Files:

- transaction reversal hook/interface/global binding;
- both plain reversal call sites;
- transaction list/detail funding join;
- asset carrying-value read service;
- net-worth/dashboard as-of reads.

Work:

1. Automatically pair funding reversal with source reversal.
2. Batch hydrate transaction summaries.
3. Implement one carrying-value formula.
4. Add estimate/lineage fields.
5. Remove misleading funded return percentage.

Acceptance:

- link/reverse races converge;
- current and historical net worth fixtures conserve value;
- same-timestamp opening does not double count; and
- no N+1 asset queries.

### Slice 4 — Reporting and all consumption readers

Files:

- rollup schema/table/repository/service;
- dashboard repository/service/shared schemas;
- budgets;
- essential burn and ledger diagnostic;
- spending warnings/change detection;
- transaction insights;
- category recommendation future exclusion seam;
- related web report/dashboard components.

Work:

1. Add formula version and new measures.
2. Preserve raw cash outflow.
3. Switch consumption consumers to the common exclusion.
4. Return nullable savings rate.
5. Update labels and exact UI states.

Acceptance:

- raw outflow reconciles;
- consumption + funding fixtures match;
- cached-row mutation tests pass for link/create/reverse;
- unaffected months remain cached; and
- no investment creates a lifestyle-spend warning.

### Slice 5 — Transaction and asset UI

Files:

- funding hooks/query keys;
- transaction row/detail actions/badges;
- mark-investment sheet;
- quick-add and create-transaction investment mode;
- asset activity/card components;
- mock handlers/data and tests.

Work:

1. Build reusable target picker and inline new-asset branch.
2. Preserve idempotency keys across retries.
3. Integrate all list/detail/cache invalidations.
4. Display carrying estimates and activity.
5. Verify mobile/keyboard/screen reader/dark/reduced-motion behavior.

Acceptance:

- existing Expense/Income flows are unchanged;
- Investment mode persists a normal expense;
- no client-side money math; and
- every empty/loading/error/replay state is usable.

### Slice 6 — Recurring SIPs

Files:

- recurring shared/template schema and migration;
- rule validation/repository/service;
- auto-post materializer;
- expected occurrence and reconciliation;
- recurring UI and tests.

Acceptance:

- auto and manual-post rules both fund correctly;
- retry creates one transaction/funding;
- closed target is handled explicitly; and
- source reversal cancels funding.

### Slice 7 — Historical conversion assistant (optional)

Offer a reviewed bulk workflow for existing transactions:

- filter eligible historical posted expenses;
- preview target and totals;
- never infer from category alone without confirmation;
- reuse the single-link service;
- process chunks of at most 200 rows per `withTxn`;
- deterministic per-row idempotency keys; and
- resumable job state if moved to BullMQ.

This slice is not required for the first release.

## 27. File-level implementation map

| Area                                   | Expected work                                        |
| -------------------------------------- | ---------------------------------------------------- |
| `packages/shared/src/asset-funding.ts` | New contracts and result types                       |
| `packages/shared/src/transaction.ts`   | Optional active funding summary                      |
| `packages/shared/src/report.ts`        | Explicit outflow/consumption/funding/formula version |
| `packages/shared/src/dashboard.ts`     | Nullable savings, carrying and funding fields        |
| `common/db/schema/asset-funding.ts`    | Table and indexes                                    |
| `apps/api/drizzle/*`                   | Generated additive migration                         |
| `asset-fundings/*`                     | Repository, services, controller, module, tests      |
| `transaction.service.ts`               | `createInTx` core                                    |
| `reverse-transaction-in-tx.ts`         | Optional funding hook                                |
| `transaction.repository.ts`            | Locked eligibility + summary joins                   |
| `asset.repository.ts`                  | Locked open target                                   |
| `asset.service.ts`                     | Reuse existing `createInTx`                          |
| carrying-value read service            | Batch valuation + funding formula                    |
| monthly rollup repository/service      | New fields, versioning, invalidation                 |
| dashboard repositories/services        | Raw vs consumption semantics                         |
| budget/safety/warning/diagnostic reads | Shared consumption exclusion                         |
| recurring files                        | Later optional asset target                          |
| web transaction feature                | sheet, badge, investment form mode                   |
| web asset feature                      | carrying card and activity                           |
| web reports/dashboard                  | explicit labels/measures                             |
| OpenAPI/generated client               | All new routes and schemas                           |
| mocks                                  | Behavior-equivalent local development support        |

## 28. Required tests

### 28.1 Shared schema tests

- positive one-paisa and maximum-safe amounts pass;
- zero, negative, float, unsafe amounts fail;
- lifecycle field combinations match database checks;
- only investment/fixed-deposit new targets pass;
- UTC timestamp strings pass; date-only/offset-free invalid values fail;
- request bodies reject monetary/source fields that must be derived; and
- transaction response without optional funding remains compatible.

### 28.2 Repository tests

- every lookup filters user id;
- lock methods emit `FOR UPDATE`;
- active predicate excludes funding reversal and reversed source;
- partial unique index prevents two posted fundings for one source;
- one reversal per original;
- cursor ordering is deterministic;
- asset history is bounded; and
- no repository API deletes or updates monetary funding fields.

### 28.3 Mutation service tests

- existing link leaves balance and transaction monetary fields unchanged;
- new investment applies one balance delta;
- new asset creates opening valuation equal to funding;
- manual funding reversal leaves source transaction/account unchanged;
- source transaction reversal creates funding reversal;
- each operation records expected audit and invalidates source month;
- idempotency replay returns identical result;
- same key/different intent returns conflict; and
- failure at every intermediate write rolls back all earlier effects.

### 28.4 Concurrency integration tests

Use `Promise.all` with at least five attempts:

- five identical existing links → one funding/audit effect;
- five identical creates → one transaction, balance delta, funding, asset when
  new, and audit set;
- five identical removals → one funding reversal;
- different assets racing for one source → one active winner;
- asset close vs link → a valid serial order, never an invalid write;
- source reverse vs link → no active funding after reversed source;
- manual removal vs source reverse → one funding reversal; and
- all tests end with `assertInvariants()`.

### 28.5 Rollup/report tests

- raw outflow unchanged by link/removal;
- consumption decreases on link and returns on removal;
- funding total changes oppositely;
- by-account flow unchanged;
- category consumption excludes funded category;
- zero-income savings rate is null;
- negative savings remains valid;
- cached rollup existing before link is invalidated/recomputed;
- repeat for create, manual removal, and source reversal;
- unrelated month cache row is preserved;
- version-1 cached row recomputes under formula version 2; and
- transfer/reversal scopes remain correct.

### 28.6 Downstream-consumer tests

- funded SIP does not consume budget;
- funded SIP does not increase essential burn;
- funded SIP is not a spending warning/change candidate;
- funded SIP is not highest consumption expense/top category;
- funded SIP remains in raw cashflow forecast/export/account flow;
- bill-specific expenses keep bill semantics;
- category recommendation history excludes it once both features land; and
- transaction history still shows the real outflow.

### 28.7 Net-worth tests

- no valuation fallback;
- contribution before latest valuation not added;
- contribution exactly at valuation timestamp not added;
- contribution after latest valuation added;
- multiple post-valuation contributions summed safely;
- funding reversal removes contribution;
- later valuation supersedes previous carrying estimate;
- new asset opening valuation + same-time funding counts once;
- source reversal removes asset attribution and restores cash;
- historical as-of boundaries are deterministic;
- liability behavior unchanged; and
- batch query count does not grow per asset.

### 28.8 API/E2E tests

- all routes require auth and appear in OpenAPI tenancy probe;
- cross-tenant combinations return not found;
- header missing/invalid returns validation problem;
- 201 vs replay 200/header behavior;
- unsupported kind and ineligible source map to documented problems;
- generated client parses all results; and
- no raw request description appears in captured funding logs.

### 28.9 Frontend tests

- eligible/ineligible transaction actions;
- existing/new asset link branches;
- idempotency key retained on retry and replaced after success;
- investment mode posts composite request, not normal create route;
- Expense and Income route behavior unchanged;
- badge/action/activity render;
- carrying estimate label;
- report labels and zero-income state;
- cache invalidation set;
- loading/error/replay/closed-target states;
- keyboard focus and dialog return;
- 320 px/no overflow;
- dark mode and reduced motion; and
- privacy mode masks all new monetary values.

### 28.10 Recurring tests

- auto-post creates one transaction/funding under retry;
- manual expected occurrence links real transaction/funding once;
- closed asset produces explicit review/failure state;
- rule kind/type validation;
- cross-tenant target rejected;
- source reversal cancels recurring funding; and
- cash forecast still includes SIP outflow.

## 29. Verification commands

Run after implementation:

```bash
pnpm migrate:generate
pnpm gen:client
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
```

Also verify:

- generated migration is additive and contains no drop/rename;
- OpenAPI diff has no unintended breaking change;
- money-path coverage remains at least 90%;
- tenancy probes include every new authenticated route;
- five-way concurrency tests are stable without test retries;
- report cash totals reconcile to fixture account movement;
- no new frontend dependency or bundle regression; and
- responsive/keyboard/manual accessibility checks pass.

## 30. Rollout and rollback

Recommended rollout:

1. Deploy additive table and code that can read absent funding safely.
2. Enable backend mutation/read routes.
3. Enable transaction and asset UI.
4. Switch reports/consumption readers in the same release as user-visible
   linking; never expose link before metrics understand it.
5. Enable recurring later.

The rollup formula version forces safe lazy recomputation.

Rollback:

- stop exposing funding mutations/UI;
- leave funding rows and table intact;
- old transaction/account/valuation data remains valid;
- do not delete funding history or manually edit production rows; and
- if report code is rolled back, clearly understand that old reports will count
  funded outflows as expenses again until the feature is restored.

## 31. Definition of done

- [ ] Additive migration and shared schemas committed.
- [ ] All funding monetary facts are append-only with paired reversals.
- [ ] Link/create/remove are idempotent and atomic.
- [ ] Source reversal hook is wired into every reversal path.
- [ ] Lock order and unique constraints cover concurrency.
- [ ] Raw outflow, consumption, funding, savings, and net-worth semantics are
      explicit and tested.
- [ ] Cached rollups invalidate by user/month and old formula versions recompute.
- [ ] Every direct expense query is classified as cash or consumption.
- [ ] Transaction, asset, report, dashboard, budget, safety, warning, and
      recommendation consumers agree.
- [ ] UI handles all responsive/accessibility/error/replay states.
- [ ] Generated client and tenancy probes are current.
- [ ] Full lint, typecheck, unit, integration, and E2E gates pass.

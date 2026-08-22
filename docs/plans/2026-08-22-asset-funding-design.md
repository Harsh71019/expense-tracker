# Asset funding from bank transactions

## Decision

Treat a SIP, fixed-deposit principal, and comparable purchases as a **cash
outflow allocated to an asset**, not as consumption. The original bank
transaction remains the source of truth for the cash movement. An immutable
asset-funding record adds the meaning that the outflow acquired or increased a
specific asset.

This is deliberately not a category-only solution, a transfer, or a valuation
update.

## User experience

### Classify an existing transaction

For every posted expense transaction, the transaction row and detail drawer
offer **Mark as investment**. The action opens a sheet with:

- the read-only transaction amount, date, source account, and description;
- an open-asset picker, grouped by asset kind;
- **Create new asset** as a picker action; and
- a confirmation that the bank transaction will not be changed.

Choosing an asset records a contribution for the transaction amount. The
transaction then displays an `Investment · {asset name}` badge that links to
the asset, and the asset shows a dated contribution in its activity/history.
The action is unavailable for income, reversed/reversal, transfer-leg, or
already-linked transactions.

This directly supports FDs and investments that users have already created in
the Assets section: a transaction can be linked to any open existing
`fixed_deposit` or `investment` asset. Other supported asset kinds can be
enabled only where their economic meaning is clear.

### Capture a future investment

The Add Transaction screen adds **Investment** next to Expense and Income.
The form collects the same source-account cash details, then an existing asset
or new-asset selection. It creates the bank outflow and asset-funding record
atomically. The user never needs to enter a duplicate expense first.

The recurring-rule UI later gains an optional linked asset for a SIP. Its
materializer creates the same funding event with its deterministic occurrence
idempotency key.

## Accounting semantics

For a ₹5,000 SIP paid from HDFC Bank:

```text
Bank cash:             -₹5,000  (the existing posted transaction)
Asset contribution:    +₹5,000  (new immutable allocation)
Consumption spending:       ₹0
```

The bank balance must not be adjusted when an existing transaction is marked.
Only the reporting and net-worth interpretation changes. This preserves the
fact that money left the bank while preventing an investment from being
reported as lifestyle spending.

An asset valuation is a separate observation of total market value. A SIP is
not itself a valuation: recording it as one would blur contributed principal
and market movement. Until the next confirmed valuation, net worth carries the
latest valuation forward plus contributions after that valuation. A later
manual or projected valuation supersedes that estimate for its `valuedAt`.

## Data model

Add an additive `asset_fundings` table through drizzle-kit. Suggested fields:

| Field | Purpose |
| --- | --- |
| `id` | immutable event identifier |
| `user_id` | tenancy boundary |
| `asset_id` | open asset being funded |
| `transaction_id` | source cash outflow; unique for an active funding |
| `amount_minor` | positive integer paise |
| `occurred_at` | funding date, normally copied from the transaction |
| `status` | `posted`, `reversed`, or `reversal` |
| `reversal_of` / `reversed_by` | append-only correction pairing |
| `created_at` | auditability |

The unique relation from funding to source transaction prevents double marking.
All repository operations require `userId` first and scope both asset and
transaction lookups to that user.

The shared API contract exposes an optional asset-funding summary on a
transaction response and new creation/reversal request and response schemas.
Runtime inputs are parsed with Zod; money remains positive integer paise.

## Write paths and correction

Create an `AssetFundingService` that orchestrates the relevant repositories
inside `withTxn`. It owns no controller concerns and records an audit entry in
the same database transaction.

There are two write paths:

1. **Link existing transaction**: validate a posted expense transaction and
   open asset, then insert an asset-funding event and audit row. It does not
   create a transaction or apply an account balance delta.
2. **Create investment**: create the normal expense transaction, its
   asset-funding event, balance delta, and audits in one transaction under one
   idempotency key.

If a classification is wrong, **Remove investment classification** creates a
compensating funding reversal. It does not reverse or alter the source bank
transaction. The original cash movement remains correct and visible.

## Reporting and net worth

Monthly rollups must add `totalAssetFundingMinor` and exclude active funded
transactions from `totalExpenseMinor`, spending charts, category spending, and
cashflow “spent” totals. The dashboard then computes savings rate as:

```text
(income - consumption spending) / income
```

This naturally includes asset contributions in saved money. The dashboard
should also show the separate invested amount, for example: `Savings 42% ·
₹10,000 invested this month`.

Net-worth reads must incorporate active contributions after the most recent
valuation for an asset, without mutating historical valuation rows.

## Delivery order

1. Shared schemas, migration, repositories, and atomic manual/existing-link
   write paths.
2. Transaction detail/list badges and the classification sheet; create-new
   asset path; asset contribution history.
3. Rollup, dashboard, reports, and net-worth carrying-value updates.
4. Investment option in quick add and recurring SIP support.
5. Conversion workflow for imported historical transactions.

## Required tests

- Link a posted expense to an existing FD/investment: account balance and
  transaction monetary fields are unchanged; exactly one funding event exists.
- Concurrent identical requests produce one event and one audit record.
- Cross-tenant asset and transaction combinations are rejected.
- A funding reversal removes savings/net-worth attribution but not the cash
  outflow.
- Rollups exclude funded outflows from consumption while reporting their
  invested total.
- Net worth carries contributions after the latest valuation and accepts a
  later valuation as the new observation.
- Recurring SIP retries produce exactly one transaction and one funding event.


# Transfers

One-line: moving money between two of the user's own accounts as one logical action, instead of a manual expense + income pair.

## Data model

Transfers don't have their own collection — a transfer is exactly two linked `Transaction` legs (one `expense` on the source account, one `income` on the destination account) sharing a `transferGroupId`. See [02-transactions.md](02-transactions.md) for the underlying `Transaction` shape.

Create payload:

| Field | Type | Notes |
|---|---|---|
| `fromAccountId` | ObjectId string | |
| `toAccountId` | ObjectId string | **must differ from `fromAccountId`** — needs inline validation/error messaging |
| `amountMinor` | integer paise, ≥1 | one amount, applied as expense on one side and income on the other |
| `occurredAt` | date | |
| `description` | string, 1–500 chars | |
| `tags` | string[], max 20 | |

Response: `{ transferGroupId, fromTransaction, toTransaction }` — two full `Transaction` objects.

Reversal response: `{ transferGroupId (new), legs: [Transaction, Transaction] }` — reversing a transfer creates a *new* linked pair of compensating legs, same append-only pattern as a single-transaction reversal.

## Business rules that shape the UI

- A transfer's two legs both carry `transferGroupId` when they show up in a plain transaction list — those rows need distinct treatment (paired/linked visual, no standalone "reverse" **or "edit"** on either leg individually; both operate on the whole group). `PATCH /v1/transactions/:transactionId` on a transfer leg is rejected outright (409) even for just `description`/`tags` — there's no per-leg edit at all, so a transfer's detail view needs its own edit-less presentation, not the normal transaction detail screen with the reverse button swapped out.
- Same-account transfers are rejected — the form should exclude the currently-selected "from" account from the "to" picker rather than only erroring after submit.
- Reversing a transfer reverses both legs atomically as one group action, not two separate reversals.

## API surface

Both endpoints require an `Idempotency-Key: <uuid>` header (see [00-overview.md](00-overview.md)).

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/transfers` | create both legs |
| `POST` | `/v1/transfers/:transferGroupId/reverse` | reverse both legs as one action |

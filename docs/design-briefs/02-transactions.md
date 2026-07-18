# Transactions

One-line: the core ledger — every expense and income entry, append-only, with corrections done via reversal rather than editing.

## Data model

`Transaction`:

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId string | |
| `accountId` | ObjectId string | required, immutable |
| `categoryId` | ObjectId string, optional | the only classification field that can be patched post-hoc |
| `type` | enum: `expense`, `income` | immutable |
| `amountMinor` | integer paise, **positive**, ≥1 | sign is derived from `type`, never stored negative — **immutable** |
| `currency` | literal `"INR"` | |
| `occurredAt` | date | immutable — when the money actually moved, not necessarily creation time |
| `description` | string, 1–500 chars | editable |
| `tags` | string[], each 1–40 chars, max 20 tags | editable, free-form |
| `source` | enum: `manual`, `csv_import`, `recurring`, `api` | provenance, read-only, worth surfacing as a badge |
| `status` | enum: `posted`, `reversed`, `reversal` | see reversal semantics below |
| `reversalOf` / `reversedBy` | transaction id, optional | links a reversed txn to its reversal and back |
| `transferGroupId` | id, optional | present only on transfer legs (see [03-transfers.md](03-transfers.md)) — these need different affordances than a normal transaction (no "reverse this leg alone") |
| `createdAt` / `updatedAt` | timestamp | |

**Editable fields, full stop: `description`, `tags`, `categoryId`.** Everything else about a posted transaction is permanent.

### Reversal, not edit

There is no "edit amount" or "delete transaction." Correcting a mistake means reversing it: a new compensating transaction is posted, and both records' `status` flips (original → `reversed`, new one → `reversal`, linked via `reversalOf`/`reversedBy`). Any "fix this transaction" flow must be framed as reverse-and-repost, not inline editing — this is a hard product invariant.

## Query/list shape

Transactions are listable filtered by `accountId`, `categoryId`, a date range (`from`/`to`), and free-text search (`q`, matches description) — cursor-paginated, not offset-paginated. Design list/filter UI around these exact filter axes.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/transactions` | create |
| `GET` | `/v1/transactions` | cursor-paginated list, filterable |
| `GET` | `/v1/transactions/:transactionId` | detail |
| `PATCH` | `/v1/transactions/:transactionId` | update `description`/`tags`/`categoryId` only |
| `POST` | `/v1/transactions/:transactionId/reverse` | reverse |

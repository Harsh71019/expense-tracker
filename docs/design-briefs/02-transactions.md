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

**Editable fields, full stop: `description`, `tags`, `categoryId`.** Everything else about a posted transaction is permanent. `categoryId` can also be explicitly cleared by patching it to `null` (a distinct action from just omitting the field, which leaves it untouched) — the category picker should support an explicit "uncategorize" option, not just swapping one category for another.

**Transfer legs (any transaction with `transferGroupId` set) reject `PATCH` entirely** — the server returns a 409 (`txn.transfer_metadata_requires_group`) even for a `description`/`tags`-only edit. A transfer leg's row in a transaction list/detail view must not offer an edit affordance at all; editing (like reversal) only makes sense at the transfer-group level. See [03-transfers.md](03-transfers.md).

### Reversal, not edit

There is no "edit amount" or "delete transaction." Correcting a mistake means reversing it: a new compensating transaction is posted, and both records' `status` flips (original → `reversed`, new one → `reversal`, linked via `reversalOf`/`reversedBy`). Any "fix this transaction" flow must be framed as reverse-and-repost, not inline editing — this is a hard product invariant.

- Only a `posted` transaction can be reversed. Reversing an already-`reversed` original, or reversing a `reversal` itself (there's no "undo the undo"), fails with a 409 (`txn.already_reversed`) — a transaction detail view should hide/disable the "reverse" action once `status` is anything other than `posted`, rather than relying on the error to communicate it.
- Never surface a standalone "reverse" action on an individual transfer leg — always drive transfer reversal through `POST /v1/transfers/:transferGroupId/reverse` (see [03-transfers.md](03-transfers.md)) so both legs reverse together as one action.

## Query/list shape

Transactions are listable filtered by `accountId`, `categoryId`, a date range (`from`/`to`), and free-text search (`q`, matches description) — cursor-paginated, not offset-paginated. Design list/filter UI around these exact filter axes.

## API surface

Every `POST`/`PATCH` below requires an `Idempotency-Key: <uuid>` header (see [00-overview.md](00-overview.md)).

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/transactions` | create |
| `GET` | `/v1/transactions` | cursor-paginated list, filterable |
| `GET` | `/v1/transactions/:transactionId` | detail |
| `PATCH` | `/v1/transactions/:transactionId` | update `description`/`tags`/`categoryId` only — 409s on a transfer leg |
| `POST` | `/v1/transactions/:transactionId/reverse` | reverse — 409s if not currently `posted` |

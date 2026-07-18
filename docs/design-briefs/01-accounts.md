# Accounts

One-line: the containers money lives in (bank, credit card, cash, wallet, investment) — each with a running balance.

## Data model

`Account`:

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId string | |
| `name` | string, 1–80 chars | |
| `type` | enum: `bank`, `credit_card`, `cash`, `wallet`, `investment` | fixed set, no custom types |
| `currency` | literal `"INR"` | single-currency product, no picker needed |
| `openingBalanceMinor` | integer paise, any sign | set once at creation |
| `balanceMinor` | integer paise, any sign | **derived/read-only** — server-maintained running balance, never directly editable |
| `isArchived` | boolean | soft-delete; archived accounts drop out of active lists/totals but their history stays |
| `createdAt` / `updatedAt` | timestamp | |

Create payload is just `name`, `type`, `openingBalanceMinor` — everything else is server-assigned.

## Business rules that shape the UI

- No account edit beyond archive — name/type/opening balance are immutable once created.
- `balanceMinor` can be negative (e.g. credit card, or cash gone into the red) — amount display must support signed values, not just "always positive."
- Archiving is one-way (no unarchive) — treat as a confirm-worthy action even though data isn't deleted.
- Every transaction, transfer, import, and recurring rule references an `accountId` — "no accounts yet" is the zero-state that gates the entire app.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/accounts` | create |
| `GET` | `/v1/accounts` | list (all, including archived — client filters) |
| `PATCH` | `/v1/accounts/:accountId/archive` | archive |

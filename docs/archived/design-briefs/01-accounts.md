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
- **Archived accounts are excluded server-side from `GET /v1/accounts`, not client-filtered.** There's no `includeArchived` param and no get-by-id endpoint, so once an account is archived the API can no longer resolve its name/type at all — a transaction from before the archive still carries that `accountId`, but the account record backing it is gone from every list response. If a screen needs to keep showing an archived account's name (e.g. in a transaction row or transfer leg), the frontend must have cached it before the archive happened; there is currently no way to look it up after the fact. Design accordingly — an "archived accounts" browsing view isn't buildable against today's API without a new endpoint.
- Every POST/PATCH here requires an `Idempotency-Key: <uuid>` header (see [00-overview.md](00-overview.md)); a retried submit replays instead of double-creating/double-archiving.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/accounts` | create |
| `GET` | `/v1/accounts` | list **active accounts only** — archived accounts are dropped, not flagged |
| `PATCH` | `/v1/accounts/:accountId/archive` | archive |

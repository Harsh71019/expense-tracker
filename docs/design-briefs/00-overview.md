# TreasuryOps — Design Brief Overview

TreasuryOps is a personal expense tracker built as an append-only, double-entry-style ledger. Single currency (INR), single user per account — each person only ever sees their own data, there is no sharing/collaboration surface.

This directory has one design brief per feature, generated directly from the live Zod schemas (`packages/shared/src/*.ts`) — the single source of truth for every field, type, and constraint in the product. Each brief lists what the feature does, its exact data fields, and the business rules that constrain any UI built around it. Treat these as a spec to design from, not a description of an existing app — hand any single file to a design session as self-contained context.

## Product shape

- **Ledger core**: accounts hold a running balance; every expense/income/transfer is a transaction; nothing is ever edited or deleted — corrections are compensating reversal entries. This is the single biggest UX constraint to design around: there is no "edit amount" anywhere in the product, by design.
- **Money is always integer paise**, formatted as `₹12,345.67`. Never show floats or divide by 100 in a mockup's copy.
- **Net worth = accounts + tracked assets** (loans, FDs, gold/silver, other investments), separate from the transaction ledger.
- CSV bank-statement import is a multi-step flow: upload → map columns → stage/review rows → commit.

## API conventions (apply across every brief below)

- **Idempotent mutations**: every POST/PATCH/DELETE that creates or changes a record (transactions, transfers, accounts, categories, category rules, assets/valuations) requires an `Idempotency-Key` header (a client-generated UUID). Retrying the same request with the same key replays the original result instead of double-posting — this is what makes "tap submit twice on a flaky connection" safe. A replayed response comes back with an `Idempotency-Replayed: true` header. Any form that posts money (quick add, transfers, imports commit) should generate one key per submit attempt and hold onto it across a retry, not mint a fresh one. (Recurring-rule endpoints are the one exception — they don't take an idempotency key today.)
- **Archived/closed items disappear from list endpoints, not just active views.** Archiving an account, archiving a category, or closing an asset removes it from `GET /v1/accounts`, `GET /v1/categories`, and `GET /v1/assets` server-side — there's no `includeArchived` query param and no get-by-id endpoint for any of the three. Once archived, a record's name/detail can't be re-fetched through the API at all (a transaction still carries its `accountId`, but the account itself is no longer resolvable). Don't design a "show archived/closed" toggle against the current API — it has nothing to page against.

## Brand constraints

- Single accent hue ~152° (green), used for CTAs and positive/income amounts; a companion red (~25° hue) for expense amounts; a muted gray for reversed/voided entries.
- Supports both a near-black (AMOLED) dark mode and a light mode.
- Typeface pairing: a humanist sans for content, a monospace for labels/metadata/timestamps.
- Currency, locale, and timezone are fixed (INR, en-IN, Asia/Kolkata) — no locale/currency switchers needed anywhere.

## Feature index

| Brief | Feature |
|---|---|
| [01-accounts.md](01-accounts.md) | Accounts |
| [02-transactions.md](02-transactions.md) | Transactions (ledger, reversal) |
| [03-transfers.md](03-transfers.md) | Account-to-account transfers |
| [04-categories.md](04-categories.md) | Categories |
| [05-category-rules.md](05-category-rules.md) | Auto-categorization rules |
| [06-imports.md](06-imports.md) | CSV bank statement import |
| [07-assets-net-worth.md](07-assets-net-worth.md) | Assets, valuations, net worth |
| [08-reports.md](08-reports.md) | Monthly rollup reports |
| [09-recurring-rules.md](09-recurring-rules.md) | Recurring transactions |
| [10-export.md](10-export.md) | CSV export |
| [11-quick-add-dashboard.md](11-quick-add-dashboard.md) | Home dashboard + quick add |
| [12-profile-settings.md](12-profile-settings.md) | Profile / settings |
| [13-auth.md](13-auth.md) | Login |

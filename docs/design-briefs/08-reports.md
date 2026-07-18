# Reports (Monthly Rollup)

One-line: pre-computed monthly spend/income summaries by category and account — a dashboard-style read, not a live query.

## Data model

`MonthlyRollup`:

| Field | Type | Notes |
|---|---|---|
| `month` | string `YYYY-MM` | the period this rollup covers |
| `byCategory` | `CategoryRollup[]` | per-category breakdown, see below |
| `byAccount` | `AccountRollup[]` | per-account net, see below |
| `totalExpenseMinor` | integer paise ≥0 | month total spend |
| `totalIncomeMinor` | integer paise ≥0 | month total income |
| `computedAt` | timestamp | when the rollup was generated — worth showing as "as of" freshness copy |

`CategoryRollup`: `{ categoryId (optional — absent means "uncategorized"), spentMinor, incomeMinor, txnCount }` — this is the shape for a spend-by-category chart (pie/bar) or ranked list.

`AccountRollup`: `{ accountId, netMinor }` (signed) — net flow per account for the month.

## Business rules that shape the UI

- **This is a cron-computed cache, not a live query** — a month with no rollup yet (too recent, or too old/never computed) returns "not found," not a fallback live calculation. Design an explicit empty/not-yet-available state per month rather than assuming every month is queryable.
- `categoryId` being optional in `CategoryRollup` means "uncategorized spend" is a real bucket that needs its own row/slice in any chart, not something to filter out.
- Only one month is fetchable at a time — there's no "range of months" or "compare to last month" endpoint; a trend view would need multiple sequential calls (one per month).
- `txnCount` per category is available — could support "12 transactions" secondary text next to each category's spend figure.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/reports/monthly/:month` | fetch one month's rollup (`month` in `YYYY-MM` format) |

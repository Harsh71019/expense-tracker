# CSV Export

One-line: download posted transactions as a CSV file, optionally scoped to a date range.

## Data model

The entire input surface:

| Field | Type | Notes |
|---|---|---|
| `from` | date, optional | range start |
| `to` | date, optional | range end |

No account/category filter, no format choice (CSV only) — intentionally the simplest feature in the product. Omitting both dates exports everything.

## Business rules that shape the UI

- Output is a file download, not an in-app data view — the UI's job is just picking (or skipping) a date range and triggering the download; no result rendering.
- Exported CSV cells are neutralized against formula injection server-side — no UI implication beyond not needing to warn users about it.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/export/csv?from=&to=` | streams/returns the CSV file |

# Category Rules (auto-categorization)

One-line: simple substring-match rules that suggest a category during CSV import, so the user doesn't hand-categorize every imported row.

## Data model

`CategoryRule`:

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId string | |
| `pattern` | string, 1–80 chars | **case-insensitive substring** matched against a transaction's `description` — not a regex, not fuzzy |
| `categoryId` | ObjectId string | which category to suggest on match |
| `createdAt` / `updatedAt` | timestamp | |

That's the entire shape — no priority/ordering field, no "applies to expense or income" filter, no archive (rules are fully deletable, unlike accounts/categories).

## Business rules that shape the UI

- Rules only affect **import staging** — they suggest a category on a staged CSV row during import (see [06-imports.md](06-imports.md)); they don't retroactively categorize existing transactions or apply to manually-entered ones.
- Matching is plain case-insensitive substring — UI copy should set that expectation precisely (e.g. "Contains…" rather than implying regex power).
- No stated precedence when multiple rules match the same description.
- Rules are hard-deleted, not archived — deletion copy can be more casual/immediate, no soft-delete framing needed.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/category-rules` | create |
| `GET` | `/v1/category-rules` | list |
| `DELETE` | `/v1/category-rules/:ruleId` | delete |

# Categories

One-line: the classification taxonomy for transactions (expense vs. income), with optional icon/color and one level of nesting.

## Data model

`Category`:

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId string | |
| `name` | string, 1–80 chars | |
| `kind` | enum: `expense`, `income` | a category is one or the other, not both — shapes how the create form should branch |
| `parentId` | ObjectId string, optional | one level of hierarchy intended (parent categories can have children) |
| `icon` | string, 1–32 chars, optional | free-text icon identifier, not validated against an enum — likely an emoji or icon-key string |
| `color` | hex string `#rrggbb`, optional | swatch picker territory |
| `isArchived` | boolean | soft-delete |
| `createdAt` / `updatedAt` | timestamp | |

## Business rules that shape the UI

- No rename/re-icon/re-color beyond create + archive — a category's `name`/`icon`/`color`/`kind`/`parentId` are fixed at creation.
- `kind` splits the whole category list conceptually — expense categories and income categories are different pools; a transaction's `type` should filter which categories are selectable wherever categories are picked (transaction form, filters, rules).
- Icon and color are both optional — design must handle categories with neither (fall back to a default swatch/initial) alongside fully-decorated ones.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/categories` | create |
| `GET` | `/v1/categories` | list |
| `PATCH` | `/v1/categories/:categoryId/archive` | archive |

# Recurring Transactions

One-line: a template + RFC 5545 recurrence rule (RRULE) that auto-posts a transaction on a schedule (rent, subscriptions, salary, etc.).

## Data model

### `RecurringRuleTemplate` (the transaction blueprint that gets posted each occurrence)

| Field | Type | Notes |
|---|---|---|
| `accountId` | ObjectId string | which account each occurrence posts to |
| `categoryId` | ObjectId string, optional | |
| `type` | enum: `expense`, `income` | |
| `amountMinor` | integer paise, ≥1 | fixed amount every occurrence — no "variable amount" support |
| `description` | string, 1–500 chars | |
| `tags` | string[], max 20 | |

### `RecurringRule`

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId string | |
| `template` | `RecurringRuleTemplate` | above |
| `rrule` | RFC 5545 RRULE string, e.g. `FREQ=MONTHLY;BYMONTHDAY=1` | **must not embed `DTSTART`** |
| `startAt` | date | the anchor date (`DTSTART` equivalent), supplied separately from the RRULE string |
| `nextRunAt` | date | server-computed, when the next occurrence will post |
| `lastRunAt` | date, optional | when it last actually posted |
| `isPaused` | boolean | user-toggleable |
| `createdAt` / `updatedAt` | timestamp | |

Updates can patch `template` (partial), `rrule`, and/or `isPaused` independently.

## Business rules that shape the UI

- **The hardest form-design problem here is a usable RRULE editor.** The raw field is a string like `FREQ=MONTHLY;BYMONTHDAY=1` or `FREQ=WEEKLY;BYDAY=MO,WE,FR` — a raw text input would be hostile. Design a structured picker (frequency → interval → day-of-week/day-of-month/month selectors depending on frequency) that serializes to/from the RRULE string, in the spirit of a calendar app's "Does not repeat / Daily / Weekly / Monthly / Custom" pattern.
- `startAt` is separate from the RRULE and must never be embedded as `DTSTART` in the string — the "starts on" date picker is a distinct field from the recurrence pattern itself.
- Auto-posted transactions get `source: "recurring"` (see [02-transactions.md](02-transactions.md)).
- Occurrences post via a background job, not client-driven — there's no "run now" action, only rule management (create/edit/pause). `nextRunAt`/`lastRunAt` are read-only status fields to display, not editable.
- Pausing (`isPaused`) stops future occurrences without deleting the rule — there's no delete/cancel action in the data model, only pause.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/recurring-rules` | create |
| `GET` | `/v1/recurring-rules` | list |
| `PATCH` | `/v1/recurring-rules/:ruleId` | update template/rrule/isPaused |

# CSV Bank Statement Import

One-line: a multi-stage flow (upload → map columns → stage/review → commit) that turns a bank's CSV export into posted transactions, with duplicate detection and a full revert path.

## Data model

Two entities:

### `ImportBatch`

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId string | |
| `accountId` | ObjectId string | which account the statement is for |
| `filename` | string | original upload name |
| `fileHash` | string | dedupe signal at the batch level |
| `mapping` | `ColumnMapping` (below) | how CSV columns map to txn fields |
| `status` | enum: `pending`, `staged`, `committed`, `reverted`, `failed` | drives which actions/screens are available |
| `stats` | `{ total, staged, duplicates, committed }` (all int ≥0) | progress/summary numbers for the batch list and detail header |
| `committedAt` / `revertedAt` | timestamp, optional | |
| `createdAt` / `updatedAt` | timestamp | |

### `ColumnMapping`

| Field | Type | Notes |
|---|---|---|
| `date` | string | source column header for the date |
| `description` | string | source column header |
| `dateFormat` | enum: `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD` | |
| `amountConvention` | enum: `single_signed` (one signed amount column) or `debit_credit_cols` (separate debit/credit columns) | branches which further fields are required |
| `amount` | string, optional | required iff `single_signed` |
| `debit` / `credit` | string, optional | both required iff `debit_credit_cols` |

Two named presets should be offered as one-click shortcuts in the mapping form: **HDFC** (`Date`/`Narration`/`DD/MM/YYYY`/debit-credit, columns `Withdrawal Amt.`/`Deposit Amt.`) and **ICICI** (`Transaction Date`/`Transaction Remarks`/`DD/MM/YYYY`/debit-credit, columns `Withdrawal Amount (INR)`/`Deposit Amount (INR)`) — real bank column headers, a starting point the user can still edit, not a guarantee.

### `StagedRow` (one per CSV row, created after mapping)

| Field | Type | Notes |
|---|---|---|
| `rowNumber` | int | for referencing back to the raw file |
| `raw` | `Record<string,string>` | original cell values, useful for a "show raw row" toggle |
| `parsed` | `{ occurredAt, amountMinor, type, description }`, optional | absent if parsing failed — see `problems` |
| `dedupeHash` | string, optional | |
| `suggestedCategoryId` | ObjectId string, optional | from category rules, see [05-category-rules.md](05-category-rules.md) |
| `problems` | string[] | human-readable parse issues — surface inline per row |
| `isDuplicate` | boolean | flagged, not auto-excluded |
| `include` | boolean | **user-controlled checkbox** — whether this row posts on commit |

## Business rules that shape the UI

- **File caps**: 5MB max, 50,000 rows max, `.csv` extension only, MIME-checked. Upload UI needs clear pre-flight messaging for oversized/wrong-type files.
- Duplicate rows are flagged (`isDuplicate`) but default to still `include`-able — the user explicitly decides, the system doesn't silently drop them. Design should make "this looks like a duplicate" a prominent but overridable signal per row, not a blocker.
- Commit is the only step that actually posts transactions (each becomes a real `Transaction` with `source: "csv_import"`); everything before that is staging/preview only, so the review screen can be treated as a safe sandbox.
- A committed batch can be **reverted** — this reverses the posted transactions (append-only rules still apply) rather than deleting them; frame revert copy accordingly ("this will reverse N transactions," not "delete").
- The mapping for a given account can be remembered/reused so repeat imports from the same bank can skip re-mapping.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/imports` | upload file + `accountId` + `mapping` → creates batch, stages rows |
| `GET` | `/v1/imports` | list batches |
| `GET` | `/v1/imports/accounts/:accountId/mapping` | fetch saved mapping for an account |
| `GET` | `/v1/imports/:importBatchId/preview` | cursor-paginated staged rows |
| `PATCH` | `/v1/imports/:importBatchId/rows/:stagedRowId` | toggle `include` and/or override `suggestedCategoryId` |
| `POST` | `/v1/imports/:importBatchId/commit` | post included rows as real transactions |
| `POST` | `/v1/imports/:importBatchId/revert` | reverse a committed batch |

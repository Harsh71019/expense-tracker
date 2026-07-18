# Assets, Valuations & Net Worth

One-line: tracks things with value that aren't ledger accounts — loans (owed to you or by you), fixed deposits, gold/silver, other investments — via periodic valuations, and rolls everything (accounts + assets) into a single net-worth number.

## Data model

### `Asset`

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId string | |
| `kind` | enum: `loan_receivable`, `loan_liability`, `fixed_deposit`, `gold`, `silver`, `investment` | drives which optional fields apply (see refinements below) |
| `name` | string, 1–80 chars | |
| `openedAt` | date | |
| `maturityAt` | date, optional | **only valid for `fixed_deposit`** |
| `annualRateBps` | int, 0–10000 (basis points, so 10000 = 100%) | **only valid for `fixed_deposit`** |
| `quantityMilliUnits` | positive int | **only valid for `gold` or `silver`** — milli-units, i.e. grams × 1000 for precision |
| `openingValueMinor` | signed integer paise | **must be ≥0 unless `kind === "loan_liability"`** — a liability is the only kind allowed to open negative |
| `isClosed` | boolean | soft-close, e.g. loan repaid or FD matured and withdrawn |
| `createdAt` / `updatedAt` | timestamp | |

This is a shape that varies by `kind` — **the create form must branch UI fields by `kind`**: FD shows maturity date + rate, gold/silver shows quantity, loan_liability is the only one whose opening value can go negative. Getting this branching right is probably the single trickiest form-design problem in this feature.

### `Valuation`

| Field | Type | Notes |
|---|---|---|
| `id` | ObjectId string | |
| `assetId` | ObjectId string | |
| `valueMinor` | signed integer paise | a point-in-time value |
| `valuedAt` | date | |
| `source` | enum: `manual` (user-entered) or `maturity_projection` (system-computed for FDs) | render differently — projected values aren't user commitments |
| `createdAt` | timestamp | |

An asset's current value = its latest valuation (or `openingValueMinor` if none yet). Valuation history is a time series per asset — chart-shaped data.

### Net Worth (computed, read-only)

`{ asOf, netWorthMinor, accounts: [{accountId, name, balanceMinor}], assets: [{assetId, name, kind, valueMinor, valuedAt}] }` — a single snapshot combining every active account balance and every open asset's latest valuation into one number, plus the breakdown lists that produced it.

## Business rules that shape the UI

- Only `loan_liability` can show a negative value — every other asset kind's value/opening value is non-negative.
- `maturityAt`/`annualRateBps` are FD-only; `quantityMilliUnits` is gold/silver-only — the create form should hide/disable these fields for other kinds rather than showing them greyed out with a validation error after submit.
- Valuations are append-only too (no edit/delete) — correcting a bad valuation means adding a new one, consistent with the ledger's reversal philosophy elsewhere.
- `source: maturity_projection` valuations are system-generated (a scheduled job projecting FD maturity value from `annualRateBps`) — visually distinguish these from user-entered manual valuations so nobody mistakes a projection for a confirmed value.
- `annualRateBps` as basis points (10000 = 100%) needs a percent-formatted input (e.g. show "7.50%", store `750`), not raw basis points exposed to the user.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/assets` | create |
| `GET` | `/v1/assets` | list |
| `POST` | `/v1/assets/:assetId/close` | close |
| `POST` | `/v1/assets/:assetId/valuations` | add a valuation |
| `GET` | `/v1/assets/:assetId/valuations` | valuation history (paginated) |
| `GET` | `/v1/net-worth` | current net worth snapshot |

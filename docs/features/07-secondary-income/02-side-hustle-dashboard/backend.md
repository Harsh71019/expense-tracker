# Side-Hustle Dashboard — Backend Plan

## Scope

Aggregate verified secondary-income transactions by stream and month. Report gross inflow, volatility/range, recurrence, contribution to total income, and amount linked to confirmed wealth transfers.

## API

- `GET /api/v1/income-streams/dashboard?range=1M|6M|12M`

Return integer paise series and counts. Do not calculate taxable profit, net business income, or “passive” status from income alone. Actual wealth-routed amount requires a confirmed transfer link or explicit tagged transfer, not a planning preference.

## Files to create

- Shared dashboard schemas
- `income-stream-dashboard.repository.ts`, `income-stream-dashboard.service.ts`
- Unit/integration tests

## Files to edit

- Income-stream controller/module, transfer read port, OpenAPI/client

## Tests

Test date buckets in IST, refunds/reversals, irregular income, no data, routing evidence, range limits, and tenant isolation.

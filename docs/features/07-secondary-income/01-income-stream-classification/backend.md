# Income-Stream Classification — Backend Plan

## Scope

Classify income transactions/recurring streams as primary salary, freelance, consulting, creator, rental, interest/dividend, business, gift, refund, or other. Keep classification separate from accounting category when necessary and preserve transaction history.

## Model

Prefer a metadata table `income_stream_classifications` referencing a detected stream or stable classification rule; avoid rewriting transaction monetary fields. A user-confirmed rule may classify future matching income and return historical aggregates through query-time matching. Refunds must not inflate secondary-income totals.

## API

- `GET /api/v1/income-streams`
- `PUT /api/v1/income-streams/:streamId/classification`
- `GET /api/v1/income-streams/summary?from=&to=`

## Files to create

- `packages/shared/src/income-stream.ts`
- DB schema/migration
- `apps/api/src/income-streams/` module/controller/service/repository/classifier
- Tests

## Files to edit

- Shared/schema exports, app module, recurring-detection read port, reports read port, OpenAPI/client/E2E probe

## Tests

Test salary exclusion, refunds, multiple side streams, rule changes without ledger mutation, date ranges, cross-tenant IDs, idempotent classification, and aggregate parity with source transactions.

# Guilt-Free Envelope — Backend Plan

## Scope

Derive a discretionary spending ceiling from the current payday plan and track ledger spending against it. This is a planning read model, not a separate wallet balance.

## Calculation

The opening allowance is the payday plan’s assigned discretionary amount. Spending is posted lifestyle expense for the plan period, excluding reversed entries and transfers. Return spent, remaining, utilization basis points, days remaining, and pace state. Negative remaining is allowed as a signed result and labelled overspent.

## API

- `GET /api/v1/payday/envelope/current`

Optional later mutation adjusts the preference for future plans, not the current ledger.

## Files to create

- `apps/api/src/payday/guilt-free-envelope.repository.ts`
- `apps/api/src/payday/guilt-free-envelope.service.ts`
- Unit/integration tests

## Files to edit

- Shared payday schemas, controller/module, OpenAPI/client, dashboard composition

## Tests

Test category grouping, reversals, no plan, overspend, period boundaries, same-day late transaction, data freshness, and tenant isolation.

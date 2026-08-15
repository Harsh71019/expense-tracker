# Zero-Lifestyle-Inflation Routing — Backend Plan

## Scope

Store an opt-in preference that proposes allocating a chosen percentage of confirmed secondary income to an eligible reserve, goal, or wealth destination. Default may be 100% only when the user explicitly selects it.

## Model and API

Add an effective-dated routing preference with percentage basis points, destination kind/ID, minimum retained cash, and enabled status. Generate payday/recommendation candidates from newly confirmed income; do not create automatic transfers.

- `GET /api/v1/income-streams/routing-preference`
- `POST /api/v1/income-streams/routing-preferences`
- `GET /api/v1/income-streams/routing-candidate`
- `POST /api/v1/income-streams/routing-candidate/confirm`

Confirmation delegates to existing transfer service and atomically resolves the candidate.

## Files to create

- Routing preference/candidate schemas and migration
- Routing service/repository/calculator tests

## Files to edit

- Income-stream module/controller, goal/safety/wealth read ports, transfer service integration, notifications, OpenAPI/client

## Tests

Test opt-in, percentage/cash floor, duplicate income, ineligible destination, concurrent confirmation, transfer rollback, disabled preference, and no automatic ledger effect.

# Payday Allocation Plan — Backend Plan

## Scope

Create an immutable plan for a salary period using effective income, commitments, safety state, goal waterfall, allocation preferences, and wealth drift. The plan contains suggested amounts and executable/manual checklist steps; it does not move money.

## Ordering

1. Mandatory bills and recurring commitments.
2. Active high-cost-debt or reserve-recovery allocation.
3. Emergency-reserve shortfall.
4. Near-term sinking funds and ordered goals.
5. Stability/growth allocation according to configured targets.
6. Guilt-free remainder.

Every paise of planned salary must be assigned exactly once or labelled unallocated. If inputs exceed salary, return a deficit plan instead of negative discretionary money.

## Persistence and API

Add `payday_preferences`, immutable `payday_plans`, and `payday_plan_steps`. Store input fingerprint, plan version, period, source salary transaction/version, assumptions, and superseded plan ID.

- `GET /api/v1/payday/preferences`
- `PUT /api/v1/payday/preferences`
- `POST /api/v1/payday/plans`
- `GET /api/v1/payday/plans/current`
- `GET /api/v1/payday/plans/:planId`
- `POST /api/v1/payday/plans/:planId/steps/:stepId/confirm`

Confirmed ledger steps delegate to transfer/transaction services inside `withTxn` with outbox/audit and store the returned ledger reference. External steps record only an explicit acknowledgement.

## Files to create

- `packages/shared/src/payday.ts`
- Payday DB schema and additive migration
- `apps/api/src/payday/*` module/controller/service/repository/planner/mutation service
- Unit, integration, concurrency, and E2E tests

## Files to edit

- Shared exports, schema index, app module, owning modules for read ports, OpenAPI/client, notification types, route probe

## Tests

Test exact conservation, deficit plans, all priority branches, duplicate plan fingerprint, concurrent step confirmation, transfer failure rollback, outbox atomicity, supersession, IST salary periods, and tenant ownership.

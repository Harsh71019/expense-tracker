# Bill-Free Future — Backend Plan

## Scope

Compare a portfolio’s actual tracked cash yield or modeled sustainable monthly withdrawal with user-selected recurring bill milestones.

## Model and calculation

Add `freedom_milestones` with name, monthly target paise, priority, optional category/recurring-rule references, and source (`derived` or `manual`). Return two separate capacities:

- `actualYieldMinor`: only verified income transactions attributable to selected assets over a documented window.
- `modeledMonthlyCapacityMinor`: eligible portfolio value multiplied by a user-selected post-tax annual rate and divided according to the documented convention.

Never label modeled capacity as income already received. Milestone progress uses the selected capacity and reports the next gap and required corpus under current assumptions.

## API

- `GET/POST/PATCH /api/v1/freedom-milestones`
- `GET /api/v1/freedom-milestones/status`

## Files to create

- Shared milestone schemas
- DB schema/migration
- `freedom-milestones` service/repository/controller or bounded submodule under projections
- Yield reader and calculator tests

## Files to edit

- Projection module, transaction/asset read ports, OpenAPI/client/E2E probe

## Tests

Test actual-vs-modeled separation, 6%-style basis-point example without hard-coding, recurring bill derivation, zero/stale portfolio, milestone ordering, exact crossing, idempotent mutations, and tenant isolation.

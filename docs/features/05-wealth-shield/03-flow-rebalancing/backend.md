# Flow-Based Rebalancing — Backend Plan

## Scope

Use future payday investable cash to reduce allocation drift without proposing asset sales. Produce a contribution routing scenario and resulting projected allocation.

## Calculation

Input current bucket values, targets, material tolerance, eligible new contribution, protected reserve minimum, and committed goal allocations. Allocate integer paise to underweight buckets using a deterministic deficit waterfall until contribution is exhausted. Return before/after values, before/after basis points, route amounts, residual drift, and limitations.

The engine must not generate a route to a source that is stale, archived, ineligible, or absent. V1 may route to bucket-level destinations; actual account selection occurs during user confirmation.

## API

- `GET /api/v1/wealth/rebalancing-plan?paydayPlanId=`

This is a read-only scenario attached to the immutable payday plan.

## Files to create

- `apps/api/src/wealth-allocation/flow-rebalancer.ts`
- `wealth-rebalancing.service.ts`
- Hand-computed unit/service tests

## Files to edit

- Shared wealth schemas, controller/module, payday read port, OpenAPI/client, recommendation candidate inputs

## Tests

Test one/multiple underweight buckets, no investable cash, already balanced, missing destination, exact remainder, protected reserve, monotonic drift reduction, maximum values, and no sale/negative route output.

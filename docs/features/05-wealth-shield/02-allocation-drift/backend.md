# Allocation and Drift — Backend Plan

## Scope

Aggregate current classified value, compare it with user targets, and produce drift evidence. Targets are user-configured planning preferences and may be suggested only as editable educational presets.

## Model and calculation

Add effective-dated `wealth_allocation_targets` containing three bucket basis-point targets summing exactly to 10,000 and a material-drift tolerance. Aggregate positive current values by classification, report unclassified/stale/excluded amounts, calculate actual basis points with deterministic remainder assignment, and mark over/underweight buckets when absolute drift exceeds tolerance.

## API

- `GET /api/v1/wealth/allocation`
- `GET /api/v1/wealth/allocation-targets`
- `POST /api/v1/wealth/allocation-targets`

Persist nightly immutable allocation snapshots only when trend/history is needed; initial endpoint may calculate on demand from bounded source counts.

## Files to create

- Allocation target/snapshot schemas and migration
- `wealth-allocation-target.repository.ts`, `wealth-allocation.service.ts`, `allocation-calculator.ts`
- Tests

## Files to edit

- Shared wealth schema, module/controller, assets valuation read port, OpenAPI/client/dashboard

## Tests

Test 10,000-bps conservation, rounding remainder, zero portfolio, stale/unclassified amounts, negative/liability exclusion, tolerance boundaries, target-version selection, concurrency, and tenant isolation.

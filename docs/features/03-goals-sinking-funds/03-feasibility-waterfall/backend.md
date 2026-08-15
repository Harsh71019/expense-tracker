# Goal Feasibility and Priority Waterfall — Backend Plan

## Scope

Extend goal planning from a simple monthly target to a transparent feasibility view based on verified income, mandatory commitments, active safety recovery, and ordered goals.

## Calculation

Compute planning surplus from effective net salary plus confirmed recurring income, less essential baseline, bills/EMIs/recurring commitments, and a configurable contingency margin. Allocate the remaining amount by safety priority and goal priority. Return required monthly, allocated monthly, shortfall, projected completion, top crowding-out commitments, and data quality.

Do not count transfers as expenses or reserve money assigned to the emergency shield as available goal cash. For variable income, use the documented conservative income basis rather than the latest high month.

## API

- Extend `GET /api/v1/goals/:goalId/plan`
- Add `GET /api/v1/goals/allocation-plan`

## Files to create

- `apps/api/src/goals/goal-feasibility.ts`
- `apps/api/src/goals/goal-allocation-waterfall.ts`
- `apps/api/src/goals/goal-commitment.reader.ts`
- Unit/integration tests

## Files to edit

- Shared goal plan schemas
- Goal service/controller/repository only as required
- Financial profile, safety, budgets, bills, recurring modules to export narrow read services
- OpenAPI/client/E2E tests

## Tests

Test priority ties, no surplus, surplus across multiple goals, active reserve recovery, variable income, target-date expiry, mandatory commitments, no double counting, monotonic allocation, tenancy, and exact paise remainder assignment.

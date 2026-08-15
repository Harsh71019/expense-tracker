# Life-Hour Calculator — Backend Plan

## Scope

Convert a discretionary amount into work minutes using the effective net salary and configured monthly work minutes. Return the inputs and formula evidence so the result is explainable.

## Calculation and API

`workMinutes = ceil(expenseMinor * monthlyWorkMinutes / netMonthlySalaryMinor)`. Return work minutes, conventional eight-hour workday equivalent, effective salary version, and work setting. Reject zero/missing salary or work minutes; never fall back silently.

- `POST /api/v1/behavioral/life-hour`

This endpoint is read-only calculation. Optional transaction ID must be tenant-scoped and limited to an expense amount; direct amount input supports pre-purchase use.

## Files to create

- `packages/shared/src/behavioral-finance.ts`
- `apps/api/src/behavioral-finance/` module/controller/service/life-hour calculator
- Unit/controller/E2E tests

## Files to edit

- Shared exports, app module, profile/transaction read ports, OpenAPI/client/route probe

## Tests

Test ₹12,000/₹80,000/160-hour example = 1,440 minutes, one-paisa rounding, custom hours, historical salary selection, missing profile, non-expense transaction, overflow, and tenant isolation.

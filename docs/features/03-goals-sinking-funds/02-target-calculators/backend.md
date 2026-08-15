# Goal Target Calculators — Backend Plan

## Scope

Implement pure calculators for each template and expose previews without persisting a goal. All calculators return the target in paise, assumptions, intermediate evidence, formula version, and limitations.

## Initial formulas

- Sabbatical: essential burn multiplied by requested survival months plus optional one-time cost.
- House: target property value multiplied by down-payment and transaction-cost basis points; city-specific defaults are configuration/catalogue data, never silently authoritative.
- Parental medical: user-selected reserve within catalogue bounds; no claim that the value guarantees coverage.
- Travel: target cost or itemized estimate divided across remaining pay periods.
- Financial independence: inflation-adjusted annual essential expenses multiplied by an editable corpus multiple.

Projection math belongs to the projection foundation where shared. Calculators reject invalid horizons, unsafe integers, and assumptions outside schema bounds.

## API

- `POST /api/v1/goal-templates/:templateKey/preview`

## Files to create

- `apps/api/src/goals/calculators/sabbatical-target.ts`
- `apps/api/src/goals/calculators/house-target.ts`
- `apps/api/src/goals/calculators/medical-reserve-target.ts`
- `apps/api/src/goals/calculators/travel-target.ts`
- `apps/api/src/goals/calculators/financial-independence-target.ts`
- Registry and hand-computed unit tests

## Files to edit

- Shared goal-template schemas, template service/controller, OpenAPI/client

## Tests

Use hand-computed fixtures, zero/maximum bounds, rounding remainder, dates across IST year/month boundaries, missing burn inputs, user override behavior, and monotonicity properties. No external market data or HTTP calls belong in calculator tests or runtime.

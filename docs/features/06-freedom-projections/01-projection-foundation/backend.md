# Projection Foundation — Backend Plan

## Scope

Create authoritative, versioned scenario math used by passive-income, SIP, FIRE, goal, and cost-of-delay features. Calculations use explicit contribution timing, rate convention, inflation, step-up schedule, and horizon.

## Assumptions

Represent annual rates and inflation in basis points, monthly contributions in paise, horizons in months, and annual step-up in basis points. Define whether annual return is nominal compounded monthly or effective annual converted to monthly. Store/display the selected convention. Tax is excluded in V1 unless the user supplies a post-tax rate assumption.

Use guarded integer/decimal arithmetic that rejects unsafe intermediate results. Do not round a display percentage and reuse it. Return series at bounded monthly/annual intervals plus target-crossing month.

## API

- `POST /api/v1/projections/compound`
- `GET /api/v1/projections/assumption-presets`

Presets are versioned illustrative scenarios, not personalized recommendations.

## Files to create

- `packages/shared/src/financial-projection.ts`
- `apps/api/src/financial-projections/` module/controller/service
- Pure `compound-projection.ts`, rate-convention helpers, preset catalogue
- Unit/property/contract tests

## Files to edit

- Shared exports, app module, OpenAPI/client/E2E route probe

## Tests

Compare against independent hand/spreadsheet fixtures; test zero rate, zero contribution, initial corpus, annual step-up timing, target crossing, inflation, 1/12/1200 months, monotonicity under nonnegative rates, overflow rejection, and deterministic series sampling.

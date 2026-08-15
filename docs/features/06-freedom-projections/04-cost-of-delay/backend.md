# Cost of Delay — Backend Plan

## Scope

Project the illustrative future value of a one-time or recurring discretionary amount if invested under a selected scenario. Return contributed amount and modeled growth separately.

## API and calculation

- `POST /api/v1/projections/cost-of-delay`

Inputs are one-time amount or monthly amount, horizon, annual rate, step-up if applicable, and convention. Reuse the projection foundation. The response says “modeled future value,” not “money lost,” and includes formula/preset version.

## Files to create

- `apps/api/src/financial-projections/cost-of-delay.ts`
- Shared schema additions and hand-computed tests

## Files to edit

- Projection service/controller, OpenAPI/client

## Tests

Test one-time and recurring paths, ₹4,000-style examples under the selected convention, zero rate, one month, long horizons, overflow, and parity with the compound engine.

# Step-Up SIP and FIRE Simulator — Backend Plan

## Scope

Use the projection foundation to model corpus growth, target dates, annual contribution step-ups, inflation-adjusted essential expenses, and editable corpus multiples.

## API

- `POST /api/v1/projections/sip`
- `POST /api/v1/projections/fire`

SIP response includes target crossing, contributed principal, modeled growth, annual series, and comparison scenario. FIRE response includes current annual essential burn, projected first-year retirement expense, selected multiple, target corpus, contribution path, and limitations. Do not claim that a corpus multiple guarantees indefinite withdrawals.

## Files to create

- `sip-projection.ts`, `fire-projection.ts`
- Projection request/response schemas and fixtures
- Service/controller tests

## Files to edit

- Shared projection schema, projection service/controller, safety read port for burn, OpenAPI/client

## Tests

Test fixed vs 10% annual step-up, contribution timing, target table examples, inflation, current corpus, target already met, unreachable horizon, zero rate, comparison consistency, and exact formula-version output.

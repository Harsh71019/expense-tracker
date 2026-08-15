# Wealth Bucket Classification — Backend Plan

## Scope

Map existing accounts/assets to one functional bucket and a liquidity/horizon profile. Classification is metadata; values continue to come from account balances and latest valuations.

## Model

Add `wealth_classifications` keyed by user, source kind, and source ID with bucket (`emergency_shield`, `stability_anchor`, `wealth_engine`), liquidity tier, minimum horizon months, risk level, effective date, and optional user note with strict length. An emergency reserve source must agree with emergency classification; a shared policy validator rejects contradictions.

Do not classify credit-card liabilities, debts, or insurance as investable wealth. Closed/archived sources retain history but are excluded from current allocation.

## API

- `GET /api/v1/wealth/classifications`
- `PUT /api/v1/wealth/classifications/:sourceKind/:sourceId`

## Files to create

- `packages/shared/src/wealth-allocation.ts`
- Wealth-classification DB schema/migration
- `apps/api/src/wealth-allocation/` module, controller, service, repository, policy validator
- Unit/integration/E2E tests

## Files to edit

- Shared/schema exports, app module, assets/accounts read ports, reserve-source service, OpenAPI/client, tenancy probe

## Tests

Test source-type eligibility, reserve consistency, stale assets, source archival, effective-date selection, idempotent/concurrent updates, cross-tenant IDs, and unchanged ledger/net-worth values after classification.

# Emergency Reserve Sources — Backend Plan

## Scope

Let users explicitly classify existing accounts and assets as eligible emergency reserves with a liquidity tier. Calculate eligible reserve value without maintaining a parallel balance.

## Data model

Add `financial_reserve_sources` with `userId`, source kind (`account` or `asset`), source ID, liquidity (`instant`, `t_plus_1`, `locked`), inclusion status, optional eligible cap in paise, effective timestamps, and audit fields. V1 links the whole current source value or a fixed cap; percentage allocations are deferred to avoid ambiguous drift.

Account value comes from `balanceMinor`; asset value comes from the latest non-stale valuation. Credit-card, liability, receivable, and negative-value sources are ineligible. Locked sources appear in net worth but do not count toward runway.

## API

- `GET /api/v1/financial-safety/reserve-sources`
- `PUT /api/v1/financial-safety/reserve-sources/:sourceKind/:sourceId`
- `GET /api/v1/financial-safety/reserves`

Mutations use idempotency and audit. The aggregate response separates instant, T+1, locked/excluded, stale, and total eligible amounts.

## Files to create

- `apps/api/src/common/db/schema/financial-reserve.ts`
- `apps/api/src/financial-safety/reserve-source.repository.ts`
- `apps/api/src/financial-safety/reserve-source.service.ts`
- `apps/api/src/financial-safety/reserve-value.service.ts`
- Tests and additive migration

## Files to edit

- `packages/shared/src/financial-safety.ts`
- Schema index, safety module/controller, OpenAPI registry, generated client, E2E probe
- `apps/api/src/assets/assets.module.ts` and accounts module only to export narrow read services if required

## Tests

Test ineligible types, negative balances, cap behavior, stale/missing valuations, archived sources, cross-tenant source IDs, duplicate classification concurrency, and no double counting. Integration fixtures must show that changing an account balance changes runway without updating reserve metadata.

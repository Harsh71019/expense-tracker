# Essential Burn — Backend Plan

## Scope

Calculate trailing essential spending from the append-only ledger and expose monthly observations, the selected burn value, coverage, and limitations. Default evaluation uses the latest three complete IST calendar months; current partial month is presented separately and excluded from the baseline.

## Calculation contract

Include posted, non-reversed expense transactions whose category group is `essential`. Exclude transfers, income, reversal legs, archived-category ambiguity only when the historical group is unavailable, and explicitly excluded one-off emergency events if a future audited classification supports it. Start with arithmetic mean of complete months; evaluate median as a later engine version rather than mixing definitions.

Return `averageMonthlyEssentialMinor`, per-month totals, observation count, excluded count/reasons, `sourceThrough`, and quality: unavailable (no complete month), limited (one or two), complete (three or more). Missing category assignments reduce confidence and are reported.

## API and module

- `GET /api/v1/financial-safety/essential-burn?asOf=`

Create a `financial-safety` module. The repository owns the bounded aggregate query; the pure calculator owns averaging and quality classification.

## Files to create

- `packages/shared/src/financial-safety.ts`
- `apps/api/src/financial-safety/financial-safety.module.ts`
- `apps/api/src/financial-safety/financial-safety.controller.ts`
- `apps/api/src/financial-safety/essential-burn.repository.ts`
- `apps/api/src/financial-safety/essential-burn.service.ts`
- `apps/api/src/financial-safety/essential-burn.ts`
- Unit and integration tests

## Files to edit

- `packages/shared/src/index.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/openapi/registry.ts`
- Generated API artifacts and E2E probe

## Tests

Hand-compute three-month fixtures; test IST month boundaries, reversals, transfers, uncategorized spend, archived categories, one/two-month quality, leap dates, maximum safe totals, and tenant isolation. Every integration test finishes with ledger invariant checks.

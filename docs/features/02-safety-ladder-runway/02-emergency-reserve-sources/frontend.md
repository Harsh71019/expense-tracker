# Emergency Reserve Sources — Frontend Plan

## Experience

Provide a reserve-source picker grouped by instant, T+1, and not eligible. Explain that selecting a source changes planning classification, not the bank account or asset itself. Show stale valuations before confirmation.

## Files to create

- `apps/web/src/features/financial-safety/components/reserve-source-manager.tsx`
- `apps/web/src/features/financial-safety/components/reserve-source-row.tsx`
- `apps/web/src/features/financial-safety/components/liquidity-tier-help.tsx`
- `apps/web/src/features/financial-safety/hooks/use-reserve-sources.ts`
- `apps/web/src/features/financial-safety/hooks/use-update-reserve-source.ts`
- Form/presentation helpers and tests

## Files to edit

- `apps/web/src/app/(app)/settings/settings-panel.tsx`
- Onboarding wizard/readiness panel
- Financial-safety barrel, query keys, generated client

## States

Handle no accounts/assets, eligible unselected sources, stale assets, archived sources, capped sources, save conflict, and last eligible source removal. Never show locked assets inside the eligible total. Use text and icons in addition to tier color.

## Tests

Verify correct grouping, cap parsing, stale warnings, account/asset identity, mutation invalidation, keyboard controls, and clear copy that no money is moved.

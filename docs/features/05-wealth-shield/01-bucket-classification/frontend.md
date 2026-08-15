# Wealth Bucket Classification — Frontend Plan

## Experience

Add a classification manager to Assets. Present the purpose, liquidity, and horizon of each bucket before assignment. Show unclassified value separately so the allocation view never silently omits it.

## Files to create

- `apps/web/src/features/wealth-allocation/components/classification-manager.tsx`
- `bucket-explainer.tsx`, `classification-row.tsx`
- `hooks/use-wealth-classifications.ts`
- Form/presentation helpers, server loader, barrel, and tests

## Files to edit

- Assets page/manager, reserve-source UI for consistent state, query keys, generated client

## States and tests

Handle unclassified, classified, ineligible, stale, archived, and conflict-with-reserve states. Test keyboard group selection, non-color bucket identification, mutation invalidation, responsive table/cards, and copy stating no money is moved.

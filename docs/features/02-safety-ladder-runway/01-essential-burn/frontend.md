# Essential Burn — Frontend Plan

## Experience

Show “Essential monthly burn” with the selected value, months included, and a link to the underlying monthly breakdown. Limited data must say “Based on 2 complete months,” not present an unlabeled exact benchmark.

## Files to create

- `apps/web/src/features/financial-safety/components/essential-burn-card.tsx`
- `apps/web/src/features/financial-safety/components/burn-breakdown-drawer.tsx`
- `apps/web/src/features/financial-safety/hooks/use-essential-burn.ts`
- `apps/web/src/features/financial-safety/server/get-essential-burn.ts`
- `apps/web/src/features/financial-safety/model/burn-presentation.ts`
- `apps/web/src/features/financial-safety/index.ts`
- Tests for each layer

## Files to edit

- `apps/web/src/app/(app)/page.tsx`
- `apps/web/src/features/insights/components/dashboard-home.tsx`
- Central query keys and generated client

## Presentation rules

Use `formatMinor()` exclusively. Display unavailable, limited, ready, stale, and high-uncategorized-spend states. The breakdown lists complete IST months and excluded current month. Provide a direct action to categorize transactions when data quality is reduced.

## Tests

Test all quality states, monthly labels in IST, negative/overflow impossible response handling, screen-reader descriptions, mobile drawer behavior, and no frontend recomputation of the canonical average.

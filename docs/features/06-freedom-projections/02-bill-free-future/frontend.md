# Bill-Free Future — Frontend Plan

## Experience

Show milestones such as utilities, groceries, shelter, and full essential baseline. A prominent mode switch distinguishes “tracked cash yield” from “modeled capacity.” Each milestone exposes the bill basis and projection assumptions.

## Files to create

- `apps/web/src/features/financial-projections/components/bill-free-meter.tsx`
- `freedom-milestone-editor.tsx`, `freedom-milestone-row.tsx`
- Hooks/server loader/model helpers/tests

## Files to edit

- Assets/dashboard pages, projection feature barrel/query keys/generated client

## States and tests

Cover no portfolio, no milestones, tracked yield unavailable, modeled capacity, milestone reached, all reached, and stale valuation. Test mode labeling, progress accessibility, recurring-bill selection, assumption drawer, and avoidance of “your portfolio pays” when using a modeled figure.

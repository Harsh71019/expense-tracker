# Allocation and Drift — Frontend Plan

## Experience

Display current versus target by bucket in a stacked comparison, with exact rupee values, basis-point/percentage differences, stale/unclassified warnings, and target editing. A chart always has a table equivalent.

## Files to create

- `apps/web/src/features/wealth-allocation/components/allocation-shield.tsx`
- `allocation-comparison-table.tsx`, `allocation-target-form.tsx`, `drift-summary.tsx`
- Hooks/server loader/presentation helpers/tests

## Files to edit

- Assets and dashboard pages, feature barrel/query keys/generated client

## States and tests

Cover no classifications, zero value, balanced, drifted, stale, unclassified, and invalid target totals. Test chart/table equivalence, basis-point input conversion, accessible legend, reduced motion, idempotent target version creation, and mobile presentation.

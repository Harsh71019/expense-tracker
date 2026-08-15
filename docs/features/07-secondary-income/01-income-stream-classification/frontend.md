# Income-Stream Classification — Frontend Plan

## Experience

Add an income-stream review list showing detected cadence, source label, recent range, and current classification. Let users correct the classification and explain that it changes reports/plans, not the original transaction amount.

## Files to create

- `apps/web/src/features/income-streams/components/income-stream-manager.tsx`
- `income-stream-row.tsx`, `classification-sheet.tsx`
- Hooks/server loader/model/barrel/tests

## Files to edit

- Reports or Settings navigation, transaction detail context, query keys/generated client

## States and tests

Cover no detected income, unclassified, salary, secondary, refund, variable stream, and stale detection. Test selection accessibility, mutation invalidation, mobile rows, and clear metadata-only wording.

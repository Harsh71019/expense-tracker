# Transaction Reflection — Frontend Plan

## Experience

For eligible discretionary entries, show an optional, dismissible reflection before or after save according to preference. Saving always remains available. Transaction detail can show both work-time and illustrative future-value context.

## Files to create

- `apps/web/src/features/behavioral-finance/components/transaction-reflection.tsx`
- `reflection-preferences-form.tsx`
- `hooks/use-transaction-reflection.ts`
- Tests

## Files to edit

- Quick-add and transaction create/detail components
- Settings panel, query keys/generated client

## States and tests

Cover below threshold, essential, eligible, missing profile, disabled, dismissed, API failure, and successful save. Test that reflection never blocks submit, preserves idempotency key, supports keyboard dismissal, uses neutral language, and does not create layout shift after save.

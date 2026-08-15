# Month-End Leftover Sweep — Frontend Plan

## Experience

Show a one-tap proposal such as “₹3,400 remains in this period. Record a transfer to Emergency Reserve or Career Pivot?” The confirmation sheet requires a real source and destination account and states that this records a transfer in TreasuryOps.

## Files to create

- `apps/web/src/features/payday/components/sweep-candidate-card.tsx`
- `apps/web/src/features/payday/components/confirm-sweep-sheet.tsx`
- `apps/web/src/features/payday/hooks/use-sweep-candidate.ts`
- Tests

## Files to edit

- Dashboard home, payday page, transfer prefill flow, query keys/generated client

## States and tests

Cover unavailable, zero leftover, candidate, changed amount, transfer conflict, completed, and dismissed states. Test source/destination selection, explicit transfer semantics, idempotency, late-expense refresh, keyboard/screen-reader behavior, and mobile layout.

# Salary Reconciliation — Frontend Plan

## Experience

Show salary occurrences in a review panel when a detected credit differs materially from the current profile or has multiple possible matches. Offer “link only,” “link and add salary change,” or “not salary.”

## Files to create

- `apps/web/src/features/financial-profile/components/salary-reconciliation-panel.tsx`
- `salary-reconciliation-card.tsx`, `resolve-salary-reconciliation-sheet.tsx`
- Hooks/tests

## Files to edit

- Salary profile/settings, pending-transactions panel where relevant, payday plan source display, query keys/generated client

## States and tests

Cover exact auto-link, variable amount, multiple candidates, late/missing occurrence, already resolved race, and mutation error. Test that “link and change” shows the effective date, creates no new transaction, and remains accessible on mobile.

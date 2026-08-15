# Salary Detection — Frontend Plan

## Experience

Show a non-blocking prompt: “We found a recurring income near ₹80,000. Use it as your salary profile?” Display source dates and variability, allow amount/effective-date correction, and provide dismiss/not-salary actions.

## Files to create

- `apps/web/src/features/financial-profile/components/salary-candidate-card.tsx`
- `apps/web/src/features/financial-profile/components/confirm-salary-candidate-sheet.tsx`
- `apps/web/src/features/financial-profile/hooks/use-salary-candidates.ts`
- Tests

## Files to edit

- Dashboard home, salary profile panel, query keys, generated client

## States and tests

Cover no candidate, one/multiple candidates, variable candidate warning, already-confirmed race, dismissal, retry with stable idempotency key, and clear language that confirmation changes profile data but does not create income.

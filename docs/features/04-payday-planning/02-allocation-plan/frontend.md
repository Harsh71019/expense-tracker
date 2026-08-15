# Payday Allocation Plan — Frontend Plan

## Experience

Add a payday workspace showing salary, commitments, safety allocation, goals, wealth allocation, and guilt-free remainder. Each step says “planned,” “record transfer,” or “mark externally completed.” The primary CTA never says that TreasuryOps sent money to a bank.

## Files to create

- `apps/web/src/app/(app)/payday/page.tsx`
- `apps/web/src/features/payday/components/payday-plan.tsx`
- `apps/web/src/features/payday/components/allocation-breakdown.tsx`
- `apps/web/src/features/payday/components/payday-checklist.tsx`
- `apps/web/src/features/payday/components/payday-preferences-form.tsx`
- Hooks/server loaders/model helpers/barrel and tests

## Files to edit

- App navigation/mobile navigation after route completion
- Dashboard home, transfer creation flow for prefilled inputs
- Query keys, generated client, route/E2E tests

## States and accessibility

Show setup-required, generating, ready, deficit, stale/superseded, partially completed, and complete states. Use a textual allocation table in addition to charts. A refresh after input changes asks before superseding an active plan.

## Tests

Test amount conservation display, deficit copy, checklist action semantics, prefilled transfer, idempotent retry, superseded plan, small screens, keyboard completion, and no optimistic claim before server confirmation.

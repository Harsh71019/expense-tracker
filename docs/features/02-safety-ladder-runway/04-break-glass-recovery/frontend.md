# Break-Glass Recovery — Frontend Plan

## Experience

When the user identifies an expense as emergency-funded, ask for explicit confirmation, show the resulting runway change, and offer a two- or three-payday replenishment scenario. Use supportive copy and keep the original transaction untouched.

## Files to create

- `apps/web/src/features/financial-safety/components/break-glass-confirmation.tsx`
- `apps/web/src/features/financial-safety/components/recovery-plan-card.tsx`
- `apps/web/src/features/financial-safety/hooks/use-reserve-recovery.ts`
- Tests

## Files to edit

- Transaction detail components to expose the opt-in action
- Runway/safety panel to display active recovery
- Payday plan candidate presentation
- Query keys and generated client

## States and safety

Show forecast before confirmation, confirmed recovery, fully replenished, stale plan after salary/profile change, and insufficient free-cash-flow states. Confirmation must say it records planning metadata and does not reverse or recategorize the expense.

## Tests

Test confirmation focus, duplicate submission, transaction link, two/three-payday selection, stale plan callout, recovery completion, responsive layout, and non-shaming language.

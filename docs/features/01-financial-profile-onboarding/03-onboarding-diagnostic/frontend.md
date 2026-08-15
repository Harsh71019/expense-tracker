# Onboarding Diagnostic — Frontend Plan

## Experience

Create a three-minute progressive onboarding flow and a persistent “Data readiness” panel. Ask only for information needed to unlock the next useful output. Users with existing ledger history should skip steps already satisfied.

## Flow

1. Confirm net salary and work hours.
2. Review essential category classification and basic fixed costs.
3. Select liquid reserve sources.
4. Record protection/debt facts or explicitly defer them.
5. Show the first available statistics and the next missing input.

## Files to create

- `apps/web/src/app/(app)/onboarding/page.tsx`
- `apps/web/src/features/financial-profile/components/onboarding-wizard.tsx`
- `apps/web/src/features/financial-profile/components/data-readiness-panel.tsx`
- `apps/web/src/features/financial-profile/components/readiness-item.tsx`
- `apps/web/src/features/financial-profile/hooks/use-financial-diagnostic.ts`
- `apps/web/src/features/financial-profile/model/onboarding-steps.ts`
- Route, component, hook, and E2E tests

## Files to edit

- `apps/web/src/features/insights/components/zero-state.tsx`
- `apps/web/src/app/(app)/page.tsx`
- App navigation only after the route is ready
- `apps/web/src/features/financial-profile/index.ts`
- Central query keys

## States and accessibility

Resume from server readiness rather than local step count. A deferred sensitive question stays “deferred,” not complete. Each step announces progress textually; focus moves to the step heading; back navigation preserves server-confirmed answers. The completion page distinguishes available, limited, and locked calculations.

## Tests

Test new user, existing-ledger user, deferred protection, interrupted/resumed flow, API partial failure, keyboard-only operation, small screens, and routing to the correct setup action from every readiness item.

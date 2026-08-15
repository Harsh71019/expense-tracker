# Goal Target Calculators — Frontend Plan

## Experience

Render calculator-specific fields inside the template wizard and update previews through a debounced API request or explicit “Calculate” action. Show the formula in plain language, assumptions, and what is excluded.

## Files to create

- `apps/web/src/features/goals/components/template-fields/sabbatical-fields.tsx`
- `house-target-fields.tsx`, `medical-reserve-fields.tsx`, `travel-target-fields.tsx`, `fire-target-fields.tsx`
- `apps/web/src/features/goals/components/goal-target-preview.tsx`
- `apps/web/src/features/goals/hooks/use-goal-target-preview.ts`
- Form discriminant helpers and tests

## Files to edit

- Goal template wizard, feature barrel, query keys

## States

Display missing prerequisite, calculating, calculated, invalid assumption, stale preview after input change, and API failure. Never calculate the canonical target independently in the component. Preserve all values when switching between preview and edit.

## Tests

Test discriminated forms, INR and percentage parsing, prerequisite links, stale-preview prevention, assumption disclosure, keyboard operation, and snapshot copy for excluded costs.

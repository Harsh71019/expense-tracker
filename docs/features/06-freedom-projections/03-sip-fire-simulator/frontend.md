# Step-Up SIP and FIRE Simulator — Frontend Plan

## Experience

Create a projection-lab route with SIP and financial-independence tabs. Default inputs may use confirmed salary, current portfolio, and essential burn, but every prefilled value identifies its source and remains editable.

## Files to create

- `apps/web/src/app/(app)/projections/page.tsx`
- `apps/web/src/features/financial-projections/components/sip-simulator.tsx`
- `fire-simulator.tsx`, `projection-comparison.tsx`, `target-crossing-summary.tsx`
- Hooks/forms/tests

## Files to edit

- Navigation after route completion, feature barrel/query keys/generated client, route tests

## States and tests

Cover missing prerequisites, preset/edit mode, target met, target not reached in horizon, invalid assumptions, and compare fixed versus step-up. Test source badges, assumption disclosure, chart/table parity, accessible tabs, mobile controls, and illustrative wording.

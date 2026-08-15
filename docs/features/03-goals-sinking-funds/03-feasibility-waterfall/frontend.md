# Goal Feasibility and Priority Waterfall — Frontend Plan

## Experience

Upgrade goal cards/detail pages with “on track,” “needs adjustment,” or “insufficient verified data.” Add an allocation-plan view explaining the order in which available savings are assigned and what is crowding out a goal.

## Files to create

- `apps/web/src/features/goals/components/goal-feasibility-panel.tsx`
- `apps/web/src/features/goals/components/goal-allocation-waterfall.tsx`
- `apps/web/src/features/goals/components/commitment-breakdown-drawer.tsx`
- `apps/web/src/features/goals/hooks/use-goal-allocation-plan.ts`
- Presentation helpers and tests

## Files to edit

- Goal card/detail/manager, existing `use-goal-plan.ts`, feature barrel, query keys

## States and copy

Show limited data rather than “infeasible” when inputs are missing. Explain that allocations are planning amounts, not transfers. Reordering goals previews the impact and uses the existing idempotent reorder mutation.

## Tests

Test every verdict, multiple-goal order, no-surplus state, missing salary/burn links, commitment evidence, reordering invalidation, and accessible waterfall ordering.

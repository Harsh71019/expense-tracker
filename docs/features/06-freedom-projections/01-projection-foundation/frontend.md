# Projection Foundation — Frontend Plan

## Experience

Build reusable scenario controls and result disclosure used by all projection tools. Users can switch conservative/base/optimistic presets and then edit every assumption. Results remain labelled illustrative.

## Files to create

- `apps/web/src/features/financial-projections/components/scenario-assumptions.tsx`
- `projection-disclosure.tsx`, `projection-series-chart.tsx`, `scenario-tabs.tsx`
- `hooks/use-compound-projection.ts`
- Form/presentation/chart helpers, barrel, and tests

## Files to edit

- Central query keys and generated client
- UI chart primitives only if existing SVG patterns cannot be reused

## States and tests

Handle initial preset, edited assumptions, calculating, stale result, invalid/overflow, and unavailable service. Test rate/step-up conversion, convention labels, chart/table equivalence, reduced motion, keyboard control, mobile layout, and no client-side canonical projection math.

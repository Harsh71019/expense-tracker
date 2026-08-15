# Side-Hustle Dashboard — Frontend Plan

## Experience

Create a secondary-income page/panel with gross inflow, monthly trend, active streams, and verified amount routed to wealth. Explain that gross inflow is not taxable profit.

## Files to create

- `apps/web/src/app/(app)/income-streams/page.tsx`
- `apps/web/src/features/income-streams/components/side-income-dashboard.tsx`
- `side-income-chart.tsx`, `side-income-summary.tsx`
- Dashboard hook/presentation helpers/tests

## Files to edit

- Navigation after route readiness, feature barrel/query keys/generated client/route tests

## States and tests

Cover no streams, irregular income, recurring income, no verified routing, stale detection, and partial API error. Test chart/table parity, tax disclaimer, accessible ranges, and mobile layout.

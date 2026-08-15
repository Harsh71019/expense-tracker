# Flow-Based Rebalancing — Frontend Plan

## Experience

Show “Use new money to rebalance” with this month’s available contribution, proposed bucket destinations, and before/after allocation. Avoid tax-saving claims; say that the plan does not require a modeled sale.

## Files to create

- `apps/web/src/features/wealth-allocation/components/flow-rebalancing-plan.tsx`
- `rebalancing-before-after.tsx`
- `hooks/use-rebalancing-plan.ts`
- Tests

## Files to edit

- Payday plan, wealth allocation page/panel, feature barrel/query keys/generated client

## States and tests

Cover no drift, no investable amount, missing destination, proposed route, and stale underlying payday plan. Test exact route totals, before/after table, educational copy, account selection handoff, keyboard accessibility, and responsive rendering.

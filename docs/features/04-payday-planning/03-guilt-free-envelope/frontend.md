# Guilt-Free Envelope — Frontend Plan

## Experience

Show the remaining discretionary allowance and days left, with supportive pacing language. It is a ceiling derived from the plan, not a bank balance. Link to contributing lifestyle transactions.

## Files to create

- `apps/web/src/features/payday/components/guilt-free-envelope.tsx`
- `apps/web/src/features/payday/components/envelope-activity-drawer.tsx`
- `apps/web/src/features/payday/hooks/use-guilt-free-envelope.ts`
- Tests

## Files to edit

- Payday page, dashboard home, transaction filter helpers, feature barrel/query keys

## States and tests

Cover no plan, no spend, on pace, near limit, overspent, stale, and period-ended states. Test accessible progress semantics, signed remaining display, transaction filtering, mobile layout, and non-shaming copy.

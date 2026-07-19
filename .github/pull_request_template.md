## Summary

<!-- What changed, and why? -->

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:integration`
- [ ] `pnpm test:e2e` (routes/auth changes only)

## Frontend checklist

Complete this section for changes under `apps/web`.

- [ ] Interactive code uses the smallest practical `"use client"` boundary.
- [ ] Query keys come from the central factory; mutations invalidate the correct key families.
- [ ] Shareable view state (month, filters, sort) lives in the URL.
- [ ] Money is rendered with `<Money />` or `formatMinor()` from `@vyaya/shared`; no inline money arithmetic was added.
- [ ] Loading, empty, and error states are covered.
- [ ] Controls are keyboard reachable, labelled, and have visible focus styles.
- [ ] Heavy client-only features are dynamically imported where appropriate.
- [ ] No hand-written memoization was added without measurement.

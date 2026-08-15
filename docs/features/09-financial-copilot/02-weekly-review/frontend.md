# Weekly Financial Review — Frontend Plan

## Experience

Provide a review inbox and detail page with summary, evidence cards, one recommended action, data freshness, and feedback. AI narration is visibly optional; rules-only reviews must look complete rather than degraded.

## Files to create

- `apps/web/src/app/(app)/reviews/page.tsx`
- `apps/web/src/app/(app)/reviews/[reviewId]/page.tsx`
- `apps/web/src/features/financial-copilot/components/weekly-review-card.tsx`
- `weekly-review-detail.tsx`, `review-preferences-form.tsx`
- Hooks/server loaders/tests

## Files to edit

- Dashboard next-action area, navigation after route readiness, feature barrel/query keys/generated client/route tests

## States and tests

Cover opt-in required, rules-only, narrated, provider fallback, stale evidence, empty history, loading/error, and archived review. Test evidence links, AI disclosure, inaccessible unsupported references, screen-reader structure, mobile layout, and preference persistence.

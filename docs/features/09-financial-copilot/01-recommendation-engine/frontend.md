# Next Best Action — Frontend Plan

## Experience

Place one primary action on the dashboard with “why this,” evidence freshness, and a direct mapped destination. Secondary recommendations belong in a separate list; never overwhelm the home screen with competing CTAs.

## Files to create

- `apps/web/src/features/financial-copilot/components/next-best-action.tsx`
- `recommendation-evidence-drawer.tsx`, `recommendation-list.tsx`
- `hooks/use-next-action.ts`, `server/get-next-action.ts`
- Action-key map, presentation helpers, barrel, and tests

## Files to edit

- Dashboard home/page, app navigation only for full recommendations view, query keys/generated client

## States and tests

Cover setup action, urgent safety action, goal action, wealth action, all-clear, stale, and refresh failure. Test action-key allowlisting, evidence display, screen-reader heading order, non-color severity, mobile layout, and no rendering of backend-supplied arbitrary links.

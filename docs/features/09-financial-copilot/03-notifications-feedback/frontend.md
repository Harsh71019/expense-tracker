# Copilot Notifications and Feedback — Frontend Plan

## Experience

Add dismiss, snooze, and “Was this useful?” controls to recommendation/review surfaces. Keep controls secondary to the action and explain when a materially changed recommendation may return.

## Files to create

- `apps/web/src/features/financial-copilot/components/recommendation-actions.tsx`
- `recommendation-feedback.tsx`, `snooze-recommendation-sheet.tsx`
- Interaction hooks/tests

## Files to edit

- Next-best-action, recommendation list, weekly review detail, query keys/generated client

## States and tests

Cover pending mutation, dismissed removal, snoozed-until state, feedback submitted, race with refreshed recommendation, and API failure rollback. Test focus after removal, keyboard menus, idempotency keys, reduced motion, and no optimistic success announcement before response.

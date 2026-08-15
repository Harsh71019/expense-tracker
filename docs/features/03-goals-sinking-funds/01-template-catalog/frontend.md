# Goal Template Catalogue — Frontend Plan

## Experience

Add “Start from a blueprint” to the goals page. Template cards explain purpose, horizon, required inputs, and liquidity/risk characteristics. Selecting one opens a short form and previews the calculated target before creating the goal.

## Files to create

- `apps/web/src/features/goals/components/goal-template-gallery.tsx`
- `apps/web/src/features/goals/components/goal-template-card.tsx`
- `apps/web/src/features/goals/components/goal-template-wizard.tsx`
- `apps/web/src/features/goals/hooks/use-goal-templates.ts`
- `apps/web/src/features/goals/hooks/use-instantiate-goal-template.ts`
- Template presentation model and tests

## Files to edit

- Goals manager/page and feature barrel
- Query keys, generated client, goals E2E tests

## States and content

Handle catalogue loading/error, disabled template, insufficient profile data, preview, and successful goal creation. Do not display named funds. Clearly label defaults as editable planning assumptions rather than recommendations.

## Tests

Test all template cards, required inputs, accessible gallery navigation, preview-to-submit values, idempotency on retry, and routing to the created goal.

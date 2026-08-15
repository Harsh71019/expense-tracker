# Zero-Lifestyle-Inflation Routing — Frontend Plan

## Experience

Offer an optional rule: “Suggest routing X% of side income to Y.” Show a preview using recent income and make explicit that each transfer still requires confirmation.

## Files to create

- `apps/web/src/features/income-streams/components/routing-preference-form.tsx`
- `routing-candidate-card.tsx`, `confirm-routing-transfer-sheet.tsx`
- Hooks/form helpers/tests

## Files to edit

- Income-stream dashboard, transfer prefill, feature barrel/query keys/generated client

## States and tests

Cover disabled, enabled, no destination, candidate, amount changed, completed, and transfer error. Test percentage parsing, accessible destination selection, explicit opt-in, idempotency, and no “automatic investment” language.

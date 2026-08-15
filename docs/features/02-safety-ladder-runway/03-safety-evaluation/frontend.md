# Safety Evaluation and Runway Clock — Frontend Plan

## Experience

Make runway the primary safety visualization: “4.5 months without salary,” accompanied by exact eligible reserves, essential burn, covered history, and threshold labels. The safety ladder appears beside/below it with completed and unmet checks.

## Components

- `RunwayClock`: progress bar/ring with critical, healthy, and fortified labels.
- `SafetyLadder`: sequential stages with evidence and unmet requirements.
- `SafetyEvidenceDrawer`: source values, dates, exclusions, and calculation explanation.
- `SafetyNextAction`: action-safe link supplied through a frontend action map.

## Files to create

- `apps/web/src/features/financial-safety/components/runway-clock.tsx`
- `apps/web/src/features/financial-safety/components/safety-ladder.tsx`
- `apps/web/src/features/financial-safety/components/safety-evidence-drawer.tsx`
- `apps/web/src/features/financial-safety/components/safety-status-panel.tsx`
- `apps/web/src/features/financial-safety/hooks/use-safety-evaluation.ts`
- `apps/web/src/features/financial-safety/server/get-safety-evaluation.ts`
- Geometry/presentation helpers and tests

## Files to edit

- Dashboard home and route
- Financial-safety barrel, query keys, generated client
- Onboarding completion screen

## Accessibility and content

Color is redundant with labels and patterns. The clock exposes a text equivalent and does not animate when reduced motion is requested. “Fortified” means target met, not guaranteed safety. Limited/stale data is visible in the headline area.

## Tests

Test tier boundaries, unavailable/limited/stale states, textual equivalents, reduced motion, narrow screens, evidence drawer, stable server/client hydration, and no discretionary CTA when the active safety action has higher priority.

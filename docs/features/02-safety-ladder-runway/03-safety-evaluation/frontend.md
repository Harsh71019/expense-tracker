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

## Final decisions (implemented)

- **Visualization**: a horizontal fill bar (0-100%, capped at the 6-month fortified threshold) rather than a radial gauge -- `runwayGeometryRatio`/`criticalMarkerRatio` (`model/runway-presentation.ts`) convert already-backend-computed integer basis points into a 0-1 ratio for pixel placement only; no financial value is recomputed client-side. A runway above six months visually caps at 100% while the exact month/day text stays uncapped.
- **Dashboard placement**: `SafetyStatusPanel` renders first in `DashboardOverview`, above `DataReadinessPanel` and `EssentialBurnCard` -- once the Safety Evaluation is available it owns the primary safety action (`SafetyNextAction`); the other two panels remain supporting evidence.
- **Action routing**: `model/safety-actions.ts` is a closed, frontend-owned `SafetyActionKey -> route` map, structurally separate from `financial-profile/model/diagnostic-actions.ts`'s `FinancialDiagnosticActionKey` map even though several string values overlap -- the client never navigates to a URL taken from the API response.
- **Sinking-fund copy**: `SafetyLadder` renders all four stages (`Ground Zero`, `Building Fortress`, `Buffer Layer`, `Wealth Ready`) always, and explicitly states under `Wealth Ready` that sinking-fund classification isn't assessable yet -- it never infers completion from an existing goal.
- **Refresh/loading isolation**: `SafetyStatusPanel` fails closed to its own error/loading state (mirroring `EssentialBurnCard`) and never throws into the surrounding dashboard tree; a refresh announces completion via an `aria-live="polite"` region. `useRefreshSafetyEvaluation` invalidates the `qk.safetyEvaluations()` prefix (not the default-`asOf` leaf key alone), since TanStack Query's partial-match invalidation requires the filter key to be a prefix of the cached key.
- **Server/client split**: `server/get-safety-evaluation.ts` fails closed to `null` on transport or schema failure (never re-exported through the feature's `index.ts` barrel, per the RSC/client boundary rule); `hooks/use-safety-evaluation.ts` and `hooks/use-refresh-safety-evaluation.ts` are the client-side TanStack Query counterparts, matching the existing `reserve-summary`/`reserve-sources` hook pair's shape exactly.

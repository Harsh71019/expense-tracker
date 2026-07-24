# Goal tracking — frontend (`features/goals/`)

## Context

This is the frontend half of the goal-tracking feature (savings goals — e.g. "Emergency Fund", "New Laptop"). The backend half is a companion PR/design doc ("goal tracking — backend design") that defines a standalone goal-tracking module: a target amount, optional target date, live progress tracked via either a linked account's balance or tagged transactions, and a simple "at current contribution rate" projection — deliberately scoped below `docs/EXTENSION-MODULES.md`'s original feasibility-calculator design, since the salary/budgets/loan modules that calculator depends on don't exist in the codebase yet.

This document targets the backend API shapes below and does not start until they exist. It is design only — implementation has not started.

## Backend API shapes this targets (from the companion backend design)

- `GoalSchema` — `{ id, name, targetMinor, targetDate?, fundingMode: 'linked_account' | 'tagged', linkedAccountId?, tag?, priority, status: 'active' | 'achieved' | 'abandoned', progressMinor, createdAt, updatedAt }` (`progressMinor` is computed by the backend on every read, not stored).
- `GoalPlanSchema` — `{ goalId, mode: 'target_date' | 'at_current_rate', requiredMonthlyMinor: number | null, projectedCompletionDate: Date | null }`.
- Endpoints: `POST /v1/goals`, `GET /v1/goals?status=`, `GET /v1/goals/:goalId`, `PATCH /v1/goals/:goalId`, `PATCH /v1/goals/reorder`, `POST /v1/goals/:goalId/abandon`, `GET /v1/goals/:goalId/plan` — all idempotent-key-guarded where they mutate, following the same conventions as every other feature's controller.

## Routes & navigation

Per `docs/frontend/FRONTEND-EXTENSIONS.md` §1/§9 (already designed, just not built): `src/app/(app)/goals/page.tsx` (grid of `<GoalCard>`) and `src/app/(app)/goals/[goalId]/page.tsx` (detail/plan view). Lives under the existing **More** tab — the five-item bottom nav (Home/Transactions/Add/Reports/More) doesn't grow. New feature slice `features/goals/` follows the standard anatomy (`components/ hooks/ server/ lib/ index.ts`) used by every other feature. New query keys: `goals()`, `goal(id)`, `goalPlan(id)`, added to the central `lib/query/keys.ts`.

## Components

- **`<GoalCard>`** — name, a new **progress ring** (SVG, animated once on mount, `prefers-reduced-motion` → static — new `components/goal-progress-ring.tsx` + `model/goal-progress-ring-path.ts`, following the exact "small hand-rolled SVG, no chart library" precedent already set by `features/reports/components/pie-chart.tsx` + `model/pie-path.ts` and `features/assets/components/sparkline.tsx`), `<Money compact>` progress/target.
  - **Scoped-down verdict chip** (the original design's green/amber/red verdict needed committed-outflow data that doesn't exist yet): renders one of `On track for <date>` / `<n> months at current rate` (no target date) / `Achieved 🎉` / `Abandoned` — a projection, not a feasibility verdict. Flag this plainly in the PR description as intentionally simpler than the original doc's verdict — it can gain real feasibility coloring once budgets/loans/salary exist.
- **Create flow** (sheet/modal, following `create-transfer-sheet.tsx`'s pattern): name → target amount (`AmountInput`) → target date (optional) → funding mode (existing-account picker, reusing the account list already fetched elsewhere, or a tag field with a one-line explainer of what tagging a transaction does).
- **`[goalId]` detail page**: progress ring/hero number, the plan callout (required-monthly or projected-date, from `GET /v1/goals/:goalId/plan`), and a contributions list — `linked_account` mode reuses the existing account transaction list filtered to that account; `tagged` mode reuses the existing transaction list filtered by tag (if that filter doesn't already exist client-side, it's a small addition to the existing transactions list query, not a new list component).
- **Reorder**: simple up/down move affordance rather than a drag-and-drop library — introducing a new UI dependency needs an explicit ask per `AGENTS.md`/`FRONTEND.md` conventions ("no new UI deps without asking"), and up/down buttons cover the same need without one.
- Achieved goals collapse into a separate "Achieved" section per the original design's instinct (trophies, not clutter); abandon lives behind an overflow menu with a confirm step.

## Data & invalidation

- `hooks/use-goals.ts` (list/get/create/update/abandon/reorder via the generated typed client, idempotency-key-on-mount pattern like `use-transfers.ts`), `hooks/use-goal-plan.ts` (`staleTime` a few minutes — it's a pure calculation, not live money).
- **Invalidation**: creating/editing a transaction or transfer that carries a goal's tag, or a transfer into a goal's linked account, should invalidate `goals()`/`goalPlan(id)` — this needs to be added to the existing central mutation-invalidation list (a review-checklist item, same category as any other cross-feature invalidation).
- No dashboard integration in this pass — a "goal at risk" or goals-summary dashboard card is a natural follow-up once the dashboard-analytics work (tracked separately) exists, not a dependency of this feature.

## Testing

- Component: progress ring/verdict rendering across states (active with/without target date, achieved, abandoned); create-flow cross-field validation (funding mode); reorder persistence — MSW-mocked.
- E2E: create a `linked_account` goal → transfer into the linked account → progress updates; create a `tagged` goal → post a tagged transaction → progress updates; goal crosses target → achieved state renders.

## Suggested implementation order

1. Ship after the backend endpoints exist and are stable (this doc assumes their shapes above).
2. `features/goals/` skeleton + `<GoalCard>` grid + create flow, reading real data (no progress ring yet — plain percentage bar reusing `category-breakdown-panel.tsx`'s existing bar pattern).
3. Progress ring component + verdict chip states.
4. `[goalId]` detail page with plan callout + contributions list.
5. Reorder UI, achieved-section collapse, abandon flow.

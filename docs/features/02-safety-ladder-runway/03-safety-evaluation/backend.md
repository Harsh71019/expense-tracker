# Safety Evaluation and Runway — Backend Plan

## Scope

Combine protection, high-cost debt, essential burn, reserve values, and sinking-fund readiness into a versioned safety evaluation. Convert reserves to runway months/days and return the current stage, unmet checks, evidence, and candidate next action.

## Rules

`runwayBasisPoints = eligibleReserveMinor * 10_000 / essentialBurnMinor`; derive display months/days without floating-point money. Default thresholds are critical below 3 months, healthy from 3 through below 6, and fortified at 6 or more. Thresholds belong to a versioned policy and may later become user-configurable.

Stages are sequential: unresolved high-cost debt or incomplete required protection prevents later-stage completion; this does not hide runway data. A result may be `limited` when the burn history or valuation freshness is limited. Do not return a fractional stage score.

## Persistence and API

Persist immutable `financial_safety_evaluations` for scheduled/dashboard reuse with input fingerprint, formula/policy versions, result JSON parsed by Zod, and source-through date.

- `GET /api/v1/financial-safety/evaluation`
- `POST /api/v1/financial-safety/evaluations/refresh`

Refresh is idempotent and normally queued; duplicate input/version returns the existing evaluation.

## Files to create

- `apps/api/src/common/db/schema/financial-safety.ts`
- `apps/api/src/financial-safety/safety-policy.ts`
- `apps/api/src/financial-safety/safety-evaluator.ts`
- `apps/api/src/financial-safety/safety-evaluation.repository.ts`
- `apps/api/src/financial-safety/safety-evaluation.service.ts`
- `apps/api/src/financial-safety/safety-evaluation.processor.ts`
- Queue/scheduler adapters, tests, and migration

## Files to edit

- Shared safety schemas, schema index, module/controller, queue registry, OpenAPI/client, dashboard composition, E2E route probe

## Tests

Test exact 3/6-month boundaries, zero burn/reserves, limited inputs, protection/debt precedence, stale valuation, input fingerprint replay, five concurrent refreshes, worker crash/retry, cross-tenant evaluation reads, and policy-version coexistence.

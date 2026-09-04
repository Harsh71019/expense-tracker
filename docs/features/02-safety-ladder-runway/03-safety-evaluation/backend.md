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

## Final decisions (implemented)

- **Planning month**: Policy Version 1 uses a flat 30-day planning month (`SAFETY_POLICY.daysPerMonth`) for `runwayDays`. Not calendar-aware; a deliberate simplification carried in the versioned policy, not hardcoded at call sites.
- **Boundary behavior**: tier is `critical` for `runwayBasisPoints < 30_000`, `healthy` for `30_000 <= runwayBasisPoints < 60_000`, `fortified` for `runwayBasisPoints >= 60_000`. Exactly 3 and exactly 6 months land in `healthy`/`fortified` respectively (never re-truncate a boundary into the tier below).
- **Policy version**: `SAFETY_FORMULA_VERSION = 1`, `SAFETY_POLICY_VERSION = 1` (`packages/shared/src/financial-safety.ts`). Persisted evaluations store their own `formulaVersion`/`policyVersion` as plain integers (not `z.literal`), so a row written under an older policy stays schema-valid after the constant is bumped -- see "policy-version coexistence" below.
- **Protection adequacy basis**: prefers effective annual CTC; falls back to `netMonthlySalaryMinor * 12` (`annualized_net_income`, quality `estimated`) when CTC is absent; `unknown`/`unavailable` when no salary version exists at all. The chosen basis and its quality are always returned in `protectionEvidence`, never hidden. Term benchmark = `10 * annual income basis`; health benchmark is the fixed ₹15,00,000 policy constant (`SAFETY_MIN_HEALTH_COVER_MINOR`), independent of income.
- **Six-month minimum vs. user preference**: `resolveTarget` computes `policyTargetMinor = essentialBurnMinor * 6` and compares it against the user's safety-buffer preference target (when not the fallback policy). The **higher** of the two becomes `effectiveTargetMinor`; a below-six-month user preference never relabels a sub-six-month runway as fortified. `meetsEffectiveTarget` is additionally gated on `runway.availability === "available"` -- an unavailable runway can never trivially "meet" a target computed from a null essential burn.
- **Sinking-fund taxonomy limitation**: `sinking_fund_buffer` always reports `not_assessable` in V1 (`buildSinkingFundCheck`) with limitation key `sinking_fund.taxonomy_unavailable`. `wealth_ready` is structurally unreachable -- `resolveStage` only ever returns `ground_zero`, `building_fortress`, or `buffer_layer`.
- **Live vs. persisted evaluation**: `GET /v1/financial-safety/evaluation` never mutates; it looks up a persisted row by `(userId, inputFingerprint, formulaVersion, policyVersion)` and returns it (`snapshotStatus: "persisted"`) when found, otherwise computes and returns a live result with `evaluationId: null` and `snapshotStatus: "live"`.
- **Refresh/idempotency**: `POST /v1/financial-safety/evaluations/refresh` gathers facts and computes the candidate evaluation *before* opening a transaction (AGENTS.md §3.4 -- nothing slow inside a transaction); the transaction itself only does `insertIfAbsent` against the unique `(userId, inputFingerprint, formulaVersion, policyVersion)` index. The idempotency request fingerprint uses the client-supplied `asOf` (or `null` when omitted) -- never a server-resolved `new Date()` default -- so two replay calls that both omit `asOf` still fingerprint identically instead of racing a spurious 409.
- **Input fingerprint composition**: essential burn's `sourceThrough` is deliberately excluded from the fingerprint -- it is a `computedAt`-under-another-name value that changes on every call regardless of underlying facts (see `calculateEssentialBurn`). The fingerprint instead uses the essential burn's `completeMonths` labels as the stable "source window".
- **Diagnostic capability rules**: `financial_runway` is available when Essential Burn is `ready`, a reserve source is `ready`, and `safetyEvaluation.runway.availability === "available"` -- protection/debt gaps never hide it. `safety_ladder` is unconditionally available once the evaluation feature exists (every check has an explicit non-crashing status). Once the diagnostic's own scaffolding (salary/accounts/categories/burn) is ready, `safetyEvaluation.nextAction` takes precedence over the diagnostic's own next-action ordering, so the dashboard never shows two contradictory primary actions.

# Recommendation Engine — Backend Plan

## Scope

Generate bounded candidates from existing feature evidence, apply deterministic eligibility/priority rules, and persist immutable recommendation snapshots. The result contains one primary action and optional secondary candidates for explanation/debugging.

## Candidate contract

Each candidate has stable kind, priority class, severity, title/copy template key, action key, evidence references, calculated benefit/shortfall where applicable, expiry, blockers, source-through date, and policy version. Candidates cannot contain arbitrary URLs, HTML, or unverified prose.

Priority order starts with data integrity/overdue commitments, high-cost debt, protection gaps, reserve recovery/runway, near-term goals, spending/budget risks, allocation drift, and wealth acceleration. Stable tie-breakers use severity, deadline, amount impact, then kind key.

## Persistence and API

Add `financial_recommendation_runs`, `financial_recommendations`, and user interaction state. Unique run key covers user, input fingerprint, and policy version.

- `GET /api/v1/copilot/next-action`
- `GET /api/v1/copilot/recommendations`
- `POST /api/v1/copilot/recommendations/refresh`

## Files to create

- `packages/shared/src/financial-copilot.ts`
- DB schema/migration
- `apps/api/src/financial-copilot/` module/controller/service/repository/candidate registry/ranker/processor
- Extensive unit/integration/concurrency tests

## Files to edit

- Shared/schema exports, app/queue modules, feature modules to expose bounded candidate producers, OpenAPI/client/E2E probes

## Tests

Use a decision table covering every priority conflict, stable ties, no candidates, stale inputs, unsupported action key, idempotent refresh, worker retry, tenant isolation, and numeric evidence references. Snapshot tests may guard copy keys but must not replace behavior assertions.

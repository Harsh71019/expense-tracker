# Onboarding Diagnostic — Backend Plan

## Scope

Compose profile, account, category, transaction-history, asset, goal, and protection readiness into a single onboarding/data-completeness response. This response tells the UI what can be calculated now and what input unlocks the next result.

## Response design

Return bounded checklist items with `key`, `status`, `source`, `lastUpdatedAt`, `requiredFor`, and a route-safe action identifier. Candidate keys include salary, work hours, essential categories, burn history, reserve sources, protection, debt, goals, and asset valuations. The API returns no arbitrary frontend path.

Readiness states are `missing`, `estimated`, `limited`, `ready`, and `stale`. Calculators consume the same readiness service to prevent the dashboard and backend from disagreeing.

## API

- `GET /api/v1/financial-profile/diagnostic`

This is a composed read only. Repository access remains inside owning modules; the service injects public services or focused read ports rather than deep-importing repositories.

## Files to create

- `packages/shared/src/financial-diagnostic.ts`
- `apps/api/src/financial-profiles/financial-diagnostic.service.ts`
- `apps/api/src/financial-profiles/financial-diagnostic.controller.test.ts`
- `apps/api/src/financial-profiles/__tests__/financial-diagnostic.service.test.ts`

## Files to edit

- `packages/shared/src/index.ts`
- `apps/api/src/financial-profiles/financial-profile.controller.ts`
- `apps/api/src/financial-profiles/financial-profiles.module.ts`
- Owning modules only where a narrow exported read service is missing
- `apps/api/src/openapi/registry.ts` and generated artifacts
- E2E tenancy probe coverage

## Tests and performance

Test all readiness transitions, stale dates, no-account cold start, insufficient burn history, missing valuation, and cross-module failure fallback. Bound queries by aggregate counts and latest rows; do not load full transaction history. Target 200 ms p95 and record component timings without financial values.

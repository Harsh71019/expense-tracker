# Goal Template Catalogue — Backend Plan

## Scope

Provide a versioned server-owned catalogue for career pivot, house down payment, parental medical reserve, annual travel, and financial independence. A template describes required inputs, calculator kind, generic horizon/liquidity guidance, and educational copy; it does not store user money.

## Contract

Return stable template keys, version, availability, required inputs, defaults, allowed ranges, output goal fields, and generic instrument characteristics. Keep catalogue content in typed source for V1; persist user-created goals through the existing goal service. Template creation uses the existing goal idempotency rail and records template key/version on the goal for explainability.

## API

- `GET /api/v1/goal-templates`
- `POST /api/v1/goal-templates/:templateKey/instantiate`

Instantiation parses calculator inputs, derives a target, and calls the existing goal mutation service. It must not deep-import a repository or create a new contribution balance.

## Files to create

- `packages/shared/src/goal-template.ts`
- `apps/api/src/goals/goal-template.catalog.ts`
- `apps/api/src/goals/goal-template.service.ts`
- `apps/api/src/goals/goal-template.controller.ts`
- Tests

## Files to edit

- Shared exports and goal schema for optional template provenance
- Goals module, OpenAPI registry/client, E2E probes
- Additive migration only if goal provenance is persisted

## Tests

Snapshot stable catalogue keys, validate every default/range, reject unknown/disabled versions, verify idempotent instantiation and user-scoped linked accounts, and prove generated goals parse through `GoalSchema`.

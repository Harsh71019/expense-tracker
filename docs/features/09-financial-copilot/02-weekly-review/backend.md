# Weekly Financial Review — Backend Plan

## Scope

Build on `docs/plans/2026-08-02-weekly-ai-financial-review-architecture.md`: generate a deterministic weekly snapshot, select a small evidence catalogue, produce a rules-only review, and optionally request validated AI narration after an explicit opt-in.

## Scheduling and persistence

Use scheduled-run discovery and BullMQ per user. Add review preferences, immutable review runs/documents, provider attempt metadata without prompts containing raw financial text, and retention policy. Deterministic key uses user plus IST review period and engine version.

AI input excludes identifiers and raw transaction descriptions by default. Output is Zod-structured, reference-validated, numerically grounded, policy-checked, and replaced by rules-only copy on any failure.

## API

- `GET/PUT /api/v1/copilot/review-preferences`
- `GET /api/v1/copilot/reviews`
- `GET /api/v1/copilot/reviews/:reviewId`
- `POST /api/v1/copilot/reviews/:reviewId/refresh-narration` only if policy permits

## Files to create

- Weekly-review schemas, DB schema/migration
- Snapshot builder, rules renderer, provider interface, validators, scheduler/processor/repositories
- Unit/integration/provider-contract/concurrency/E2E tests

## Files to edit

- Copilot module/controller, config env schema and `env.example` only when a provider is actually enabled, queue/notification registries, OpenAPI/client

## Tests

Test exact-four-per-month/weekly policy decision, duplicate scheduling, crash recovery, snapshot redaction, invalid references/numbers, provider timeout, rules fallback, opt-in/out, retention, and no confidential values in logs.

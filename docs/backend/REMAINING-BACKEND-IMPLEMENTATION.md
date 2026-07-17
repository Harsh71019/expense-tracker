# Remaining Backend Implementation Work

> Updated: 2026-07-16
>
> This document contains only backend/API prerequisites. Frontend work begins only after the
> relevant backend section is complete and verified.
>
> Status: **implemented**. The completion gates at the end of this document are the source of
> truth for verification; frontend work may begin after they pass in the target worktree.

## Global rules

- Every money write uses `withTxn`; no HTTP, file work, or parsing runs inside the transaction.
- Every mutation is server-side idempotent. The response replay must be authoritative, not a UI
  convention.
- New collections/indexes are additive `migrate-mongo` migrations.
- Repository methods remain scoped by required `userId`.
- Runtime HTTP data is validated with shared Zod schemas.
- Every changed API contract is registered in OpenAPI and followed by `pnpm gen:client`.
- Each idempotent mutation needs a `Promise.all` test with at least five identical attempts.

## Shared idempotency foundation

### Current state

- `migrations/013-idempotency-records.cjs` adds the unique `(userId, operation, key)` index.
- `IdempotencyRepository` and `IdempotencyService` exist locally.
- The service records a result in the same transaction as the mutation and returns it on replay.

### Implemented

1. Define a Zod-validated stored-record shape rather than relying only on generic Mongo values.
2. Ensure every operation stores a replayable result:
   - create/update operations store the created/updated response;
   - `204` archive/delete operations store a durable `null` result;
   - reversal operations store their reversal response.
3. Ensure every repository mutation accepts the transaction session when called through the
   idempotency service.
4. Ensure duplicate-key recovery reads the committed record and never reports success before a
   result is available.
5. Add unit/integration tests for successful first attempt, replay, concurrent race, and failed
   transaction rollback.

## Accounts

### Required contract

- `POST /v1/accounts`: required `Idempotency-Key`, `201` first success, `200` replay, and
  `Idempotency-Replayed: true` on replay.
- `PATCH /v1/accounts/{accountId}/archive`: required key, `204` both first success/replay, and
  replay header.

### Implemented

1. Finish `AccountMutationService` transaction/session wiring.
2. Wire the controller to the replay-aware service without breaking existing service callers.
3. Add OpenAPI headers and `200` replay response for creation; describe archive replay header.
4. Regenerate client.
5. Add five-attempt create and archive integration tests, asserting exactly one account effect and
   one archive effect.

## Categories

### Required contract

- Idempotent create/archive with required header and replay behavior.
- Explicit backend decision/enforcement for a child's kind matching its parent's kind.

### Implemented

1. Make category repository writes session-aware.
2. Add replay-aware mutation service/controller paths.
3. Add OpenAPI headers/responses and regenerate client.
4. Add concurrency tests for create/archive.
5. Add parent-kind validation before exposing nested category creation.

## Category rules

### Required contract

- Register list/create/delete in OpenAPI.
- Idempotent create/delete with required headers and replay semantics.

### Implemented

1. Make rule repository writes session-aware.
2. Add idempotent create/delete service paths.
3. Register `CategoryRule`, create schema, rule-id parameter, problem responses, and all paths.
4. Regenerate client.
5. Add five-attempt create/delete tests and preserve longest-match behavior tests.

## Transfers

### Required contract

- Transfer creation must require, not merely accept, `Idempotency-Key`.
- Group reversal must have documented replay behavior; add a key if current natural replay is not
  sufficient.

### Implemented

1. Make the controller reject an absent key before calling the service.
2. Update OpenAPI so transfer create header is required.
3. Decide and implement reversal idempotency/replay contract.
4. Regenerate client.
5. Run existing transfer parallel tests and add reversal replay coverage.

## Assets and valuations

### Completed prerequisite

- Asset, valuation, net-worth, and user-profile HTTP timestamp schemas now use `z.coerce.date()`
  where API JSON transports ISO strings.

### Required contract

- Idempotent asset create, close, and valuation create.
- Replay behavior and headers registered in OpenAPI.

### Implemented

1. Make asset close and valuation writes session-aware where necessary.
2. Add replay-aware mutation paths for create, close, and valuation append.
3. Preserve create's atomic asset + opening valuation + audit transaction.
4. Register required headers/replay responses and regenerate client.
5. Add five-attempt integration tests for each write path, including invariant assertions.
6. Keep valuation list pagination truthful: one full page until cursor support exists.

## CSV export

### Required contract

- Register `GET /v1/export/csv` with `ExportCsvQuerySchema`.
- Describe `text/csv; charset=utf-8`, attachment disposition, and problem responses.

### Implemented

1. Add path to OpenAPI registry.
2. Generate client and ensure it exposes CSV payload without casts.
3. Add OpenAPI/controller contract test.
4. Keep existing formula-injection and posted-only export integration tests green.

## User profile

### Required contract

- Register `GET /v1/profile` with `UserProfileSchema`, auth, and 404 problem response.

### Implemented

1. Add OpenAPI path and generated-client output.
2. Add profile controller/OpenAPI test for successful and missing profiles.
3. Do not add update HTTP behavior; the existing update schema is not authorization for an edit API.

## Saved import mapping

### Required contract

- Register `GET /v1/imports/accounts/{accountId}/mapping` using
  `AccountImportMappingSchema`.

### Current state

- The registry path and generated client were added locally.

### Implemented

1. Add OpenAPI controller test so the mapping path cannot drift out of the generated client.
2. Verify ownership/not-found response semantics and document them accurately.

## Transaction details and metadata

### Required contract

- Add tenancy-scoped `GET /v1/transactions/{transactionId}`.
- Make metadata PATCH idempotent.
- Clarify transfer-leg metadata policy before allowing PATCH on a transfer leg.

### Implemented

1. Add repository/service lookup by transaction id scoped to user.
2. Register GET path and generated response.
3. Add PATCH idempotency with replay response/header.
4. Decide whether transfer-leg metadata edits are rejected, group-wide, or independently valid;
   encode and test that rule.
5. Add direct-load tenancy tests plus five-attempt PATCH concurrency tests.
6. Regenerate client.

## Completed backend verification order

1. Shared idempotency service tests and migration verification.
2. Saved mapping OpenAPI contract test.
3. CSV export OpenAPI contract test.
4. Profile OpenAPI contract test.
5. Accounts idempotency implementation and integration tests.
6. Categories idempotency implementation and integration tests.
7. Category rules OpenAPI/idempotency implementation and integration tests.
8. Transfers header/reversal replay hardening and integration tests.
9. Assets/valuations idempotency implementation and integration tests.
10. Transaction detail GET/PATCH contract and integration tests.

## Completion command set

```bash
pnpm gen:client
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
```

Do not commit a backend slice until its relevant migration, OpenAPI output, unit tests, and
integration/concurrency coverage are included together.

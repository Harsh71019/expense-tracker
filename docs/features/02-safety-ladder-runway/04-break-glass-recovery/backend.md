# Break-Glass Recovery — Backend Plan

## Scope

Detect and record confirmed emergency-reserve use, then generate a temporary replenishment plan before ordinary wealth-allocation candidates resume. Reserve use is not inferred from any withdrawal without user confirmation.

## Data model and flow

Add `reserve_events` referencing the source and optional transaction/transfer, with event type `withdrawal_confirmed` or `replenished`, amount, occurred date, reason category, and audit fields. Create immutable `reserve_recovery_plans` with shortfall, target pay periods, proposed contribution per period, and status.

Confirmation and plan creation occur through `withTxn` when a ledger reference is attached; write the notification outbox row in the same transaction. The plan never changes the transaction or balance. Repeated confirmation uses transaction/event uniqueness and idempotency.

## API

- `POST /api/v1/financial-safety/reserve-events`
- `GET /api/v1/financial-safety/recovery-plan`
- `POST /api/v1/financial-safety/recovery-plan/acknowledge`

## Files to create

- Shared reserve-event/recovery schemas
- `apps/api/src/common/db/schema/reserve-recovery.ts`
- `reserve-recovery.repository.ts`, `reserve-recovery.service.ts`, `reserve-recovery-plan.ts`
- Tests and additive migration

## Files to edit

- Safety controller/module, notification types, payday candidate inputs, OpenAPI/client, E2E probes

## Tests

Test duplicate transaction confirmation, unrelated transaction tenancy, shortfall arithmetic, two/three-pay-period plans, concurrent confirmations, notification atomicity, repayment completion, and preservation of ledger invariants.

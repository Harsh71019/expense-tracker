# Month-End Leftover Sweep — Backend Plan

## Scope

At the end of a salary period, calculate genuine unspent discretionary allowance and offer eligible destination goals/reserve/wealth accounts. A sweep is created only after user confirmation through the existing transfer path.

## Rules and API

Generate candidates in the final configured days of the period or after period close. Candidate amount is `max(0, allowance - posted lifestyle spend - already confirmed sweep amount)`. Prioritize active reserve recovery, emergency reserve shortfall, then selected goals and underweight wealth bucket.

- `GET /api/v1/payday/sweep-candidate`
- `POST /api/v1/payday/sweep-candidate/confirm`
- `POST /api/v1/payday/sweep-candidate/dismiss`

Confirmation requires source/destination accounts, delegates to transfer service, and atomically stores candidate resolution/audit/outbox. Use deterministic candidate keys per user and salary period.

## Files to create

- Payday sweep schema additions
- `month-end-sweep.service.ts`, `month-end-sweep.repository.ts`, schedule/processor
- Unit/integration/concurrency tests and migration if resolution is persisted separately

## Files to edit

- Payday module/controller, goal/safety/wealth read ports, notification types, OpenAPI/client, E2E tests

## Tests

Test date window, late-posted expense, already-swept amount, concurrent confirmation, failed transfer rollback, destination tenancy/type, priority ordering, dismiss/reappearance policy, and ledger invariants.

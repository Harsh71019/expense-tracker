# Transaction Reflection — Backend Plan

## Scope

Attach optional life-hour and cost-of-delay insight to discretionary transaction creation/detail without blocking ledger writes. Store only user preference and interaction state; calculate insight from authoritative engines.

## Model and API

Add `behavioral_preferences` with enabled state, minimum discretionary threshold, surfaces (`pre_save`, `post_save`, `detail`), and cost-of-delay preset. Add bounded `behavioral_interactions` only if dismiss/snooze measurement is required.

- `GET/PUT /api/v1/behavioral/preferences`
- `GET /api/v1/behavioral/transactions/:transactionId/reflection`

Transaction creation remains owned by `transactions`; a reflection failure must never fail the money write. Pre-save direct amount calculation uses the existing calculator endpoints.

## Files to create

- Preference/interaction schemas and migration
- Behavioral preference/reflection service/repository tests

## Files to edit

- Behavioral module/controller, transaction read port, OpenAPI/client

## Tests

Test essential/lifestyle/uncategorized handling, threshold boundary, disabled preference, missing salary, reversed transaction, reflection service failure isolation, and tenant ownership.

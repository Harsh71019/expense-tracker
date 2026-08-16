# Protection and Debt Profile — Backend Plan

## Scope

Persist structured facts required by ground-zero safety checks: term-life cover, whether cover is independent or employer-only, personal health base and super-top-up cover, dependants, and declared high-cost debt. This metadata is not a ledger balance and does not replace future loan/account modeling.

## Data model

Add effective-dated `protection_snapshots` and `declared_debts`. Protection stores cover amounts, ownership/source flags, policy expiry dates, and an explicit `not_applicable` reason for term cover where permitted by product policy. Debt stores kind, outstanding paise, annual rate basis points, minimum payment, linked liability when available, and status.

Do not store policy numbers, insurer credentials, document images, card PANs, or unstructured medical data in the first release. Employer-only protection must remain distinguishable from independent cover.

### As implemented: "linked liability account" is an existing `loan_liability` asset

This plan was written before the net-worth asset registry existed, and referred to a
"linked liability account". No such account type exists, and introducing one would have
created a second liability system alongside the one already in `net_worth_assets`.

The shipped implementation therefore links a declared debt to an existing **open
`loan_liability` asset** owned by the same user. Consequences, all deliberate:

- `declared_debts.linked_asset_id` is a nullable FK to `net_worth_assets`.
- A linked debt's current outstanding amount is **derived per read** from the absolute
  value of that asset's latest valuation. `declared_outstanding_minor` is `NULL` for a
  linked debt (enforced by a CHECK constraint), so there is never a second balance to
  drift.
- An unlinked debt stores the user's own estimate, and every response labels it as one.
- A missing or zero valuation surfaces as `outstandingMinor: null`, never as zero owed.
- Resolving a debt is a status change on the debt row only. It never modifies, values,
  closes, or deletes the linked asset, and never touches the ledger.
- The financial-profiles module reaches assets only through `LiabilityAssetReadService`,
  a read-only tenant-scoped service exported by `AssetsModule` whose results are parsed
  with an explicit runtime schema. No Drizzle row crosses the module boundary.

Insurance cover remains a protection fact: no protection column is ever summed into net
worth.

### Effective dating and idempotency

`protection_snapshots` is append-only, with a unique index on `(user_id, effective_from)`.
`PUT /financial-profile/protection` normalizes `effectiveFrom` to the start of its
Asia/Kolkata calendar day and appends; the same day twice is a domain conflict, never an
overwrite. Database CHECK constraints mirror the Zod invariants (cover amounts only where
the status claims that source, a structured reason only with `not_applicable`, bounded
dependant count), so a direct SQL write cannot create a combination the API would reject.

## API

- `GET /api/v1/financial-profile/protection`
- `PUT /api/v1/financial-profile/protection`
- `GET /api/v1/financial-profile/debts`
- `POST /api/v1/financial-profile/debts`
- `PATCH /api/v1/financial-profile/debts/:debtId`

Debt status changes are metadata updates; any actual payoff transaction still goes through the ledger. An outstanding debt linked to an account derives its current amount from the account when possible and labels declared amounts as estimates.

## Files to create

- `packages/shared/src/financial-protection.ts`
- `apps/api/src/common/db/schema/financial-protection.ts`
- `apps/api/src/financial-profiles/protection.service.ts`
- `apps/api/src/financial-profiles/protection.repository.ts`
- `apps/api/src/financial-profiles/debt-profile.service.ts`
- `apps/api/src/financial-profiles/debt-profile.repository.ts`
- Unit/integration tests and an additive migration

## Files to edit

- `packages/shared/src/index.ts`
- `apps/api/src/common/db/schema/index.ts`
- `apps/api/src/financial-profiles/financial-profile.controller.ts`
- `apps/api/src/financial-profiles/financial-profiles.module.ts`
- `apps/api/src/openapi/registry.ts`
- Generated OpenAPI/client artifacts and route probes

## Tests and security

Test employer-only flags, policy expiry boundaries, debt-rate threshold boundaries, linked-account tenancy, outdated snapshot selection, idempotent mutations, and no accidental logging of coverage/debt amounts. Integration tests prove a user cannot link another tenant’s liability account. These facts must not be sent to an AI provider without a separately approved redaction contract.

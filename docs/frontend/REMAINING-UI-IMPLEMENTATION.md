# Remaining UI and API Implementation Work

> Updated: 2026-07-16
>
> Scope: feature work documented in `docs/frontend-gaps/*-UI.md` that is not yet complete.
> This is an execution checklist, not a replacement for those feature guides.
>
> **Execution rule:** finish and verify a feature's backend/API contract first. Only then start
> that feature's frontend UI. Do not overlap backend and UI implementation for the same feature.

## Current baseline

- Phase 2 ledger UI exists.
- Phase 3 import UI exists: upload, preview, staged-row edits, commit, and revert.
- Saved-import-mapping reuse is partially implemented locally; it still needs tests and verification.
- The shared timestamp schemas for assets, valuations, net worth, and user profiles now coerce ISO HTTP timestamps safely.
- A generic `idempotency_records` migration and transactional idempotency service have been added locally.
- Account HTTP mutation wiring has begun, but the OpenAPI contract, integration tests, and UI are still outstanding.

## Non-negotiable completion rules

Every item below must preserve these rules:

- Amounts are integer paise; never perform display-string or float money arithmetic.
- Monetary writes remain append-only and use `withTxn`.
- Mutations are server-side idempotent; disabled buttons are never the duplicate-write mechanism.
- New indexes and collections are additive `migrate-mongo` migrations.
- Runtime API data is Zod-parsed even when the generated client has TypeScript types.
- Each completed slice needs `pnpm lint`, `pnpm typecheck`, unit tests, relevant integration tests, and e2e tests for new authenticated routes.

## 1. Accounts — in progress

### Backend remaining

1. Finish account archive idempotency so both the archive update and idempotency record use the same session.
2. Require `Idempotency-Key` for account create and archive at the public HTTP boundary.
3. Define replay behavior:
   - create returns `200` plus `Idempotency-Replayed: true`;
   - archive returns the original successful `204` plus replay header.
4. Register request headers and replay responses in OpenAPI, then run `pnpm gen:client`.
5. Add integration tests using at least five concurrent identical creates and archives.

### UI remaining

1. Add `/accounts` and link it from `/more`.
2. Build active-account list: name, account type, and exact signed balance.
3. Build create form with explicit positive/owed balance direction and integer-paise input.
4. Build archive confirmation explaining that ledger history remains.
5. Re-export/move the existing account query/create hooks so quick-add and account management have one public feature API.
6. Invalidate accounts, transaction list filters, and future net-worth data after mutations.

### Tests

- signed-balance view model including zero, credit-card liability, and safe integer edge cases;
- create validation and server-problem mapping;
- archive confirmation/copy;
- idempotency-header reuse and query invalidation;
- route loader hydration;
- e2e: second account, exact balance, archive, and ledger-history preservation.

## 2. Categories

### Backend remaining

1. Add create/archive idempotency records and same-transaction writes.
2. Require idempotency headers and register replay semantics in OpenAPI.
3. Add backend validation for parent/child kind consistency if parent selection is exposed.
4. Add five-attempt concurrent create/archive integration tests.

### UI remaining

1. Add `/categories` linked from `/more`.
2. Build a pure parent/child tree model with missing-parent fallback.
3. Render separate expense and income sections.
4. Build create form: kind, name, parent, optional icon, optional hex color.
5. Build archive confirmation; do not offer delete, rename, or historical reassignment.
6. Consolidate the quick-add/import category query under `features/categories`.

### Tests

- tree construction, missing parent, and parent-kind filtering;
- list hierarchy and icon/color rendering;
- mutation idempotency and invalidation of categories, import previews, transaction lists, and rules;
- e2e create/use/archive behavior.

## 3. Transfers

### Backend remaining

1. Make transfer create header mandatory instead of optional.
2. Publish reversal replay semantics; add an explicit idempotency key if natural replay is insufficient.
3. Regenerate the OpenAPI client and retain/expand concurrent-transfer coverage.

### UI remaining

1. Add `/transfers/new`, linked from Add and More.
2. Build transfer form with distinct from/to accounts, positive paise amount, description, date, and tags.
3. Generate one idempotency UUID per mounted form; retain it until success.
4. Group transfer legs in transaction rendering without merging unrelated records.
5. Replace generic transaction undo for transfer legs with group reversal.
6. Invalidate accounts, transactions, and net worth after create/reversal.

### Tests

- grouping complete/incomplete/reversal groups and unrelated same-amount transactions;
- same-account form rejection;
- mandatory header and cache invalidation;
- regression proving a transfer leg never calls single-transaction reverse;
- e2e create, retry, reverse, and balance restoration.

## 4. Assets, valuations, and net worth

### Backend remaining

1. Finish idempotency for asset create, close, and valuation creation.
2. Add corresponding additive indexes/migration entries when required by the record strategy.
3. Publish headers/replay contracts in OpenAPI and regenerate.
4. Keep valuation pagination honest: current response has one complete page, not cursor pagination.

### UI remaining

1. Add `/assets` and `/assets/[assetId]`; link Assets from More.
2. Replace the reports placeholder with the supported current net-worth report only.
3. Add `qk.assets()`, `qk.assetValuations(assetId)`, and `qk.netWorth()`.
4. Add a tested signed-money presentation wrapper; never send a negative number to `formatMinor()`.
5. Build asset create form with kind-specific fields:
   - fixed deposit maturity/rate;
   - gold/silver quantity in milli-units;
   - loan-liability negative-value direction.
6. Build valuation append form/history and close confirmation.
7. Invalidate asset, valuation, and net-worth queries after every write.

### Tests

- ISO date parsing, signed money, and safe integer boundaries;
- kind-specific form model and rate conversion;
- net-worth empty/liability/missing-valuation states;
- idempotency and cache invalidation;
- e2e asset creation, valuation append, liability impact, close, and retained history.

## 5. Category rules

### Backend remaining

1. Register list/create/delete paths and schemas in OpenAPI.
2. Add idempotency to create/delete and publish headers/replay behavior.
3. Add five-attempt concurrent integration coverage.
4. Regenerate client.

### UI remaining

1. Add `/category-rules` linked from More.
2. Build rule list resolving active category names safely.
3. Build literal-pattern create form and explain case-insensitive substring/longest-match behavior.
4. Build delete confirmation that explains only future imports change.
5. Add `qk.categoryRules()` and invalidate it after rule/category changes.

### Tests

- unavailable-category fallback and rule sentence formatting;
- empty, overlap, and delete-confirmation states;
- typed-client/idempotency/invalidation tests;
- e2e broad/specific rule matching and delete fallback.

## 6. CSV export

### Backend remaining

1. Register `GET /v1/export/csv` and `ExportCsvQuerySchema` in OpenAPI.
2. Describe the `text/csv` response and `Content-Disposition` header accurately.
3. Regenerate client and add contract coverage.

### UI remaining

1. Add `/export`, linked from More and optionally Reports.
2. Build all-posted-transactions/default and optional IST-aware date range controls.
3. Validate range with `ExportCsvQuerySchema` and prevent `from > to`.
4. Build generated-client download hook: Blob, temporary object URL, anchor click, and guaranteed URL revocation.
5. Never render or log CSV content in the browser.

### Tests

- range construction and fallback filename;
- generated-client download, failure mapping, object URL cleanup, and no auto-retry;
- pending/error/accessibility states;
- e2e downloaded CSV content and formula-neutralization behavior.

## 7. Profile summary

### Backend remaining

1. Register `GET /v1/profile`, schema, auth, and not-found problem response in OpenAPI.
2. Regenerate client and add contract test.
3. Do not add profile editing: there is no authorized update endpoint.

### UI remaining

1. Add `features/profile` server loader and read-only profile-summary component.
2. Load Better Auth session and app profile in parallel on `/more`.
3. Show display name, email, `English (India) / en-IN`, and `India Standard Time / Asia/Kolkata`.
4. Render a non-sensitive unavailable-profile state without breaking settings actions.

### Tests

- loader parse/failure cases;
- component source separation between session email and profile fields;
- unavailable profile behavior;
- tenancy e2e.

## 8. Saved import mapping reuse — partially implemented

### Remaining

1. Verify the new OpenAPI mapping path and generated client in clean checks.
2. Complete mapping-form state model for edit-before-load and account-switch races.
3. Add `useSavedImportMapping` tests: empty id disabled, per-account cache, null mapping, invalid payload, and retry.
4. Add component tests for prefill, manual-edit preservation, explicit replacement, no mapping, and lookup failure.
5. Invalidate only the selected account's mapping after a successful upload.

## 9. Transaction metadata and detail UI

### Backend remaining

1. Add tenancy-scoped `GET /v1/transactions/{transactionId}`.
2. Make metadata PATCH idempotent and publish header/replay behavior.
3. Define whether transfer legs are patchable individually; avoid misleading transfer-wide UI.
4. Regenerate client and add concurrency tests.

### UI remaining

1. Add `/transactions/[transactionId]` plus loading/not-found boundaries.
2. Add `qk.txn(id)`, loader, query hook, and update hook.
3. Show immutable facts: amount, type, account, occurred date, source, status, and linkage.
4. Permit editing only description, category, and tags.
5. Add account/category filter controls to the ledger list while preserving URL state.
6. Add optional tag capture to quick-add using the same tag model.
7. Route transfer-leg reversal to the transfer-group action.

### Tests

- patch diff, tag normalization, and archived-reference fallback;
- permitted-field-only form behavior and nullable category clearing;
- detail loader/update/idempotency behavior;
- URL filter serialization;
- e2e metadata correction without monetary mutation.

## Required execution order: backend first, frontend second

Complete every numbered backend phase—including migrations, OpenAPI generation, and required
integration/concurrency tests—before beginning its paired frontend phase.

1. **Saved import mapping backend:** register the endpoint and generate the client.
2. **Saved import mapping frontend:** complete reuse/race handling and its tests.
3. **CSV export backend:** register CSV OpenAPI contract and generated client.
4. **CSV export frontend:** build download UI and tests.
5. **Profile backend:** register profile OpenAPI contract and generated client.
6. **Profile frontend:** build read-only More-page summary and tests.
7. **Accounts backend:** complete idempotency migration, controller/service/repository behavior,
   OpenAPI, and five-attempt integration coverage.
8. **Accounts frontend:** build `/accounts` only after step 7 is green.
9. **Categories backend:** complete idempotency, parent-kind validation decision, OpenAPI, and
   concurrency tests.
10. **Categories frontend:** build `/categories` only after step 9 is green.
11. **Category rules backend:** complete OpenAPI, idempotency, and concurrency tests.
12. **Category rules frontend:** build `/category-rules` only after step 11 is green.
13. **Transfers backend:** make create/reversal replay contract mandatory and generated.
14. **Transfers frontend:** build form/group reversal/list integration only after step 13 is green.
15. **Assets/net-worth backend:** finish idempotency and contract tests; the ISO date parsing
    prerequisite is already addressed.
16. **Assets/net-worth frontend:** build routes and report only after step 15 is green.
17. **Transaction metadata backend:** add detail GET, idempotent PATCH, and transfer-leg policy.
18. **Transaction metadata frontend:** build detail/edit/filter/tag UI only after step 17 is green.

## Commit and push policy

- Keep one logical feature/contract change per conventional commit.
- Stage only files changed for that slice; do not stage unrelated pre-existing workspace modifications.
- Run the relevant checks before each commit.
- Push only after the commit succeeds.

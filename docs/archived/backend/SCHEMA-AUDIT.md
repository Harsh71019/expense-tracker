# TreasuryOps Schema and Index Audit

> Status: design/audit proposal for review. No schemas, migrations, repositories, or runtime
> behavior are changed by this document.
>
> Scope reviewed on 2026-07-16: all shared Zod schemas, Mongo repositories, migrations 001-010,
> Better Auth integration, public list/query contracts, and the implemented account, category,
> transaction, transfer, import, asset, valuation, profile, and audit collections.

## 1. Executive Summary

The current model is not overloaded with unnecessary keys. Its main weakness is the opposite:
several important invariants exist only in service code or prose, and some query/index/tenancy
details do not yet match the repository's own rules.

The monetary core has good fundamentals:

- integer minor units;
- positive transaction amounts with sign derived from type;
- append-only reversal entries;
- transactional balance updates;
- user-scoped business reads;
- import dedupe hashes;
- transfer and reversal linkage;
- append-only asset valuations;
- shared Zod contracts.

The highest-value work is not adding many product fields. It is tightening state models, tenancy,
idempotency, database validation, and indexes.

## 2. Priority Findings

### P0 — resolve before adding more money-writing features

#### P0.1 Opening-balance invariant is ambiguous

An account starts with:

```text
openingBalanceMinor = input
balanceMinor        = input
```

No opening transaction is posted. Therefore this statement in the architecture is currently
false if interpreted literally:

```text
balanceMinor == SUM(all effective transactions)
```

The actual invariant is either:

```text
balanceMinor == openingBalanceMinor + SUM(effective transaction deltas)
```

or the system must post an explicit opening-balance ledger entry and stop treating the account
field as an external baseline.

Recommendation: keep `openingBalanceMinor` as an immutable baseline because it is simple, then
make every invariant test, balance verifier, report, and document use the baseline-plus-ledger
formula. Do not create a fake income/expense category merely to represent opening balance.

#### P0.2 Import staging is not tenant-shaped

`staged_rows` has no `userId`. Its repository methods accept `batchId` first, and import-batch
state-transition methods such as `markParsed`, `incrementCommittedCount`, `markCommitted`, and
`markReverted` also omit `userId` from their filters.

That conflicts with the non-negotiable rule that every repository method takes `userId` first and
includes it in every filter.

Recommendation:

- add `userId` to every staged row;
- use `{ userId, batchId, rowNumber }` for staged-row identity/querying;
- make every import repository method take `userId` first;
- include `userId` in worker job validation and every status transition;
- retain the parent-batch ownership check at the service boundary.

#### P0.3 Idempotency is incomplete and the current unique key is globally scoped

Only manual transaction/transfer creation stores an idempotency key. Accounts, categories,
profile changes, asset creation/closure, valuations, import upload/commit/revert, transaction
metadata updates, and authentication-security mutations do not all follow the stated rule that
every mutation is idempotent.

The transaction index is globally unique on `{ idempotencyKey: 1 }`, while replay lookup is by
`{ userId, idempotencyKey }`. A UUID collision across users would reject the second user's write
but could not return that user's original result.

Recommendation:

- scope uniqueness to `{ userId, idempotencyKey }`;
- define idempotency storage per aggregate rather than forcing every key into `transactions`;
- for non-ledger resources, either store `idempotencyKey` on the created record or use a dedicated
  `idempotency_records` collection containing request hash, state, status, response reference, and
  expiry;
- reject reuse of the same key with a different canonical request hash;
- keep structural idempotency for reversal linkage, but still define the HTTP replay contract.

#### P0.4 Archived accounts can block required reversals

Balance updates filter on `isArchived: false`. A transaction may be posted, its account archived,
and a later reversal then fails because the compensating balance update cannot touch the archived
account.

Recommendation: archival must not prevent ledger correction. Either:

- allow internal reversal/import-revert balance deltas on archived accounts while preventing new
  user postings; or
- refuse archival while any reversible posted transaction exists, which is less practical.

The first option is recommended. Add `archivedAt` for lifecycle clarity, but do not make archived
accounts mutable for ordinary posting.

#### P0.5 Import finalization can separate ledger effects from batch state

Import chunks write transactions, balance deltas, committed stats, and audit entries in Mongo
transactions. The final `markCommitted` happens afterward. The committed-only unique file-hash
index can reject that state transition after ledger rows have already landed—for example, when
the same bytes are staged with a mapping that produces different dedupe hashes.

Recommendation: redesign the state transition so uniqueness/reservation and finalization cannot
leave committed money under a `staged` batch. Use explicit compare-and-set states such as
`staged -> committing -> committed`, a commit lease/attempt identifier, and a transactional final
chunk/finalization protocol. Document how crash recovery resumes each state.

### P1 — address in the schema-hardening change

#### P1.1 Transaction status is not a discriminated state model

The current schema permits impossible combinations such as:

- `status: "posted"` with `reversalOf`;
- `status: "reversal"` without `reversalOf`;
- `status: "reversed"` without `reversedBy`;
- both `reversalOf` and `reversedBy`;
- a transfer group with an arbitrary number of legs.

Recommendation: model transaction state as a Zod discriminated union and mirror the critical
conditions in a Mongo validator:

| Status     | Required                  | Forbidden                                             |
| ---------- | ------------------------- | ----------------------------------------------------- |
| `posted`   | base ledger fields        | `reversalOf`, `reversedBy`                            |
| `reversed` | base fields, `reversedBy` | `reversalOf`                                          |
| `reversal` | base fields, `reversalOf` | `reversedBy`, idempotency key inherited from original |

Transfer pairing remains a transactional/invariant-test concern because Mongo document validators
cannot enforce exactly two documents across a collection.

#### P1.2 There are no Mongo collection validators

The API validates inputs and most repository outputs with Zod, but native-driver writes have no
database-side guard. A future bug, script, or manual write can insert floats, invalid statuses,
missing tenant keys, or malformed audit entries.

Recommendation: add phased `$jsonSchema` validators through migrations, beginning with:

1. `transactions`;
2. `accounts`;
3. `audit_log`;
4. `import_batches` and `staged_rows`;
5. assets and valuations;
6. categories and profiles.

First audit existing documents, then introduce validation at a safe level and tighten it after
clean data is proven. Validators supplement Zod; they do not replace it.

#### P1.3 Audit records are under-specified

`audit_log` currently accepts unbounded strings and arbitrary metadata with only:

```text
userId, action, entityId, meta?, at
```

Missing structure makes review, retention, and secret prevention difficult.

Recommended shape:

```text
eventId              unique stable identifier
userId               tenant/actor user
actorType             user | worker | scheduler | system
action                closed union
entityType            account | category | transaction | transfer | import_batch | asset | valuation
entityId              string identifier
requestId?            request correlation
idempotencyKey?       mutation correlation, never a session token
at                    immutable timestamp
meta?                 small action-specific validated object
schemaVersion         integer event schema version
```

Do not store passwords, auth codes, cookies, raw CSV rows, full request bodies, or secrets in
`meta`. An audit event represents a successful committed change; do not add a mutable `outcome`
field to ledger audit entries.

#### P1.4 Category hierarchy integrity is not enforced

`parentId` is accepted without verifying that the parent:

- belongs to the same user;
- exists and is active;
- has the same income/expense kind;
- is a root category, preserving the intended one-level hierarchy.

Recommendation: validate all four rules in the service/repository transaction before insert.
Mongo has no foreign keys, so tests and user-scoped repository checks are required.

#### P1.5 Category kind is not matched to transaction type

A valid income category can currently be attached to an expense and vice versa because creation
checks only category existence.

Recommendation: category lookup for transaction creation/update must return and validate `kind`,
not just existence. Reversal entries may preserve the original category as historical metadata
even though the reversal transaction has the opposite ledger type; reports must explicitly
exclude or net reversal status correctly rather than infer category semantics from reversal type.

#### P1.6 Asset liability signs allow the wrong direction

The schema prevents negative values for non-liabilities, but a `loan_liability` may still be
created or valued with a positive value. That can incorrectly increase net worth.

Recommendation:

- `loan_liability`: value must be `<= 0` (choose whether zero is allowed for closure snapshots);
- all other kinds: value must be `>= 0`;
- enforce the same rule for opening value and every appended valuation;
- if a liability is paid off, append a zero valuation and then close it.

#### P1.7 Import row inclusion can enter an impossible state

The update schema permits `include: true` for a row with parse problems, no parsed payload, no
dedupe hash, or a duplicate hash. Commit later throws or hits a uniqueness error.

Recommendation: define an includable-row invariant:

```text
include == true
  => parsed exists
  && dedupeHash exists
  && problems is empty
  && isDuplicate == false
```

If intentional duplicate override is a product requirement, it needs an explicit override field,
new dedupe identity, audit event, and UI warning. A plain `include` toggle is not enough.

#### P1.8 Date contracts are broader than the API convention

Many HTTP-bound fields use `z.coerce.date()`. That accepts more than the documented “ISO 8601 UTC
over the wire” contract and can accept numeric or implementation-dependent date strings.

Recommendation: define one shared wire-date schema that accepts an ISO datetime with timezone,
normalizes it to UTC, and rejects ambiguous local dates. Keep separate internal/database parsing
where a real `Date` is expected, deriving both types from shared schema helpers rather than
duplicating DTOs.

### P2 — useful correctness and operability improvements

#### P2.1 Archive/close timestamps are missing

Add:

- `accounts.archivedAt?`;
- `categories.archivedAt?`;
- `net_worth_assets.closedAt?`.

Require the timestamp when the lifecycle flag is true and forbid it when false. This improves
auditability and enables future “as of” views. Do not add soft-delete fields to transactions,
valuations, or audit records.

#### P2.2 Import failure data is too thin

A failed batch records only `status: "failed"`. Add bounded, non-sensitive fields:

- `failedAt?`;
- `failureCode?` from a closed union;
- `failureDetail?` safe user-facing summary;
- `parserVersion` so retries are reproducible;
- optionally `commitAttemptId`/lease fields if the P0 finalization design uses them.

Do not persist exception stacks or full raw CSV content in the batch.

#### P2.3 Import hashes and filenames are weakly validated

- `fileHash` should be exactly 64 lowercase hexadecimal characters for SHA-256.
- `dedupeHash` should have the same explicit format in internal stored schemas.
- `filename` needs a sensible maximum length and control-character rejection.
- mapping column names and raw cell values need length caps.
- approximate row count is useful, but parsed row count must also enforce the 50,000-row limit.

#### P2.4 Import stats lack relational invariants

Each value is non-negative, but the schema does not enforce relationships. Define and test:

```text
duplicates <= staged <= total
committed <= staged
committed <= count(included, successfully posted rows)
```

Because stats are cached, recovery must be able to recompute them from staged rows and ledger
lineage.

#### P2.5 Asset temporal rules are missing

Service validation should enforce:

- `maturityAt > openedAt` when maturity exists;
- valuation belongs to an existing user-owned asset;
- `valuedAt >= openedAt` unless importing verified historical data;
- a clear policy for future-dated valuations;
- closed assets reject new ordinary valuations, except an explicit closure workflow.

`annualRateBps` and `quantityMilliUnits` are appropriately integer-scaled and should remain so.

#### P2.6 Names are case-sensitive and archived names remain reserved

Account and category unique indexes use Mongo's default case-sensitive comparison. Therefore
`Food` and `food` can coexist, while an archived `Food` can prevent recreating exactly `Food`.

Choose and document one policy before changing indexes:

- recommended: store `normalizedName` using a deterministic Unicode normalization/case-folding
  rule, enforce uniqueness per tenant/scope, and keep display `name` unchanged;
- decide separately whether archived names stay reserved or only active records participate in
  uniqueness.

Do not rely on locale-dependent application lowercasing without test vectors.

#### P2.7 Query refinements and limits are incomplete

- transaction query should enforce `from <= to`;
- cursor strings should have a small maximum length before base64 decoding;
- transaction page max is currently 100, while repository rules say max 200;
- valuation listing returns an unbounded list with a synthetic no-more-pages envelope;
- account, category, asset, import-batch, and valuation lists should either use cursor pagination
  or be explicitly documented as tightly bounded reference lists.

At minimum, imports and valuations should become real cursor-paginated endpoints.

#### P2.8 Mutation request objects silently strip unknown keys

Plain Zod objects strip unknown properties by default. That prevents raw key propagation, but it
also hides client typos such as `amountMionr`.

Recommendation: make mutation bodies and multipart metadata strict so unknown keys return a 422.
Apply this deliberately and regenerate/diff OpenAPI. Query schemas may need separate handling for
framework-added values.

#### P2.9 Safe-integer limits are inconsistent

Most money schemas cap at JavaScript safe integers, but imported parsed amounts and several stats
use only `.int()`/`.positive()`.

Recommendation: export canonical shared schemas for:

- positive money minor units;
- signed money minor units;
- non-negative bounded counts;
- basis points;
- milli-units;
- SHA-256 hex values.

Reuse them everywhere. Account balance `$inc` also needs overflow protection so a sequence of
individually valid writes cannot exceed the safe range.

## 3. Collection-by-Collection Assessment

| Collection                   | Current assessment                                         | Recommended additions/changes                                                                                          |
| ---------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Better Auth `user`           | Vendor-managed core fields; app profile correctly separate | Add only plugin-required `twoFactorEnabled`; do not duplicate profile or ledger settings.                              |
| Better Auth auth collections | Vendor-managed                                             | Generate/diff pinned plugin schema; add 2FA and passkey storage through project migrations.                            |
| `user_profiles`              | Sufficient for current locale/timezone scope               | No auth secrets or MFA flags; consider profile `id` only if API conventions require it.                                |
| `accounts`                   | Core fields are appropriate                                | Clarify opening-balance invariant; add `archivedAt`; normalize name; protect balance overflow and reversal-on-archive. |
| `categories`                 | Product fields are sufficient                              | Add `archivedAt`, normalized name, and parent ownership/kind/depth validation.                                         |
| `transactions`               | Good ledger base; state combinations too loose             | Discriminated status, database validator, tenant-scoped idempotency, internal lineage validation, pagination indexes.  |
| `audit_log`                  | Too weakly typed                                           | Add event/entity/actor/request/schema fields and typed bounded metadata.                                               |
| `import_batches`             | Good provenance base; lifecycle incomplete                 | Tenant-scope every transition; add failure/attempt fields and atomic finalization state machine.                       |
| `staged_rows`                | Missing tenant key and state correlation                   | Add `userId`, unique row identity, inclusion invariant, bounded raw cells.                                             |
| `net_worth_assets`           | Good stable metadata model                                 | Add `closedAt`, temporal validation, optional normalized name if uniqueness is desired.                                |
| `asset_valuations`           | Correct append-only history                                | Enforce sign by asset kind, add idempotency, real pagination, and tie-breaker index.                                   |

## 4. Index Audit

### 4.1 Transactions

Current list queries sort by `{ occurredAt: -1, _id: -1 }`, but indexes stop at `occurredAt`.
Recommended query-aligned indexes:

```text
{ userId: 1, occurredAt: -1, _id: -1 }
{ userId: 1, accountId: 1, occurredAt: -1, _id: -1 }
{ userId: 1, categoryId: 1, occurredAt: -1, _id: -1 }
{ userId: 1, transferGroupId: 1 }
{ userId: 1, importBatchId: 1, status: 1 }
{ userId: 1, reversalOf: 1 } unique/partial according to migrated data
{ userId: 1, idempotencyKey: 1 } unique/partial
{ userId: 1, dedupeHash: 1 } unique/partial (already correctly tenant-scoped)
```

Use partial filters for optional fields rather than relying only on sparse behavior where the
exact null/missing semantics matter. Verify with `explain()` before retaining both old and new
indexes.

Description search uses an unanchored case-insensitive regex and cannot use a normal B-tree index.
For a personal dataset this may be acceptable. Do not add an Atlas Search dependency until query
volume proves it necessary.

### 4.2 Imports

Recommended:

```text
import_batches: { userId: 1, createdAt: -1, _id: -1 }
staged_rows:    { userId: 1, batchId: 1, rowNumber: 1 } unique
staged_rows:    { createdAt: 1 } TTL (retain current seven-day policy)
```

Keep the committed-file uniqueness rule only after resolving the P0 finalization protocol.

Migration 010 drops an index even though the current repository policy describes migrations as
additive-only/no-drop. That historical conflict should be documented and reconciled before the
next migration. Do not casually copy that pattern into future feature migrations.

### 4.3 Assets and valuations

Recommended:

```text
net_worth_assets: { userId: 1, isClosed: 1, name: 1, _id: 1 }
asset_valuations: { userId: 1, assetId: 1, valuedAt: -1, _id: -1 }
```

If valuation creation becomes idempotent, add a tenant-scoped unique idempotency index or use the
shared idempotency collection.

### 4.4 Categories, accounts, audit, profiles

Recommended supporting indexes, subject to the normalized-name decision:

```text
accounts:      { userId: 1, isArchived: 1, normalizedName: 1 }
categories:    { userId: 1, isArchived: 1, kind: 1, normalizedName: 1 }
audit_log:     { userId: 1, at: -1, _id: -1 }
user_profiles: { userId: 1 } unique (already present)
```

Do not add speculative indexes for fields that have no query. Every index increases write cost and
must be justified by an actual filter/sort/uniqueness rule.

## 5. Shared Zod Schema Recommendations

### 5.1 Canonical primitives

Create once and reuse:

- `PositiveMinorAmountSchema`;
- `SignedMinorAmountSchema`;
- `NonNegativeCountSchema`;
- `ObjectIdStringSchema`;
- `IdempotencyKeySchema`;
- `Sha256HexSchema`;
- `IsoUtcDateTimeSchema`;
- `OpaqueCursorSchema`;
- `NormalizedNameSchema` if the chosen strategy exposes it internally.

Keep internal normalized fields and import hashes out of public response schemas unless clients
actually need them.

### 5.2 Account schema

Keep:

- `openingBalanceMinor`;
- cached `balanceMinor`;
- fixed `currency: "INR"`;
- archive rather than delete.

Add/refine:

- immutable-baseline documentation;
- `archivedAt` correlation;
- normalized-name policy;
- safe-range balance updates.

Do not add a mutable “current balance” input to update DTOs.

### 5.3 Category schema

Keep current icon/color fields. Add parent integrity in business validation rather than duplicating
parent data. Decide whether category names are unique across kinds; the current index prevents the
same name under the same parent even when kinds differ.

### 5.4 Transaction schema

Keep `type` as `expense | income`. A transfer is correctly represented by two linked legs; adding
`type: "transfer"` would complicate sign math and is not recommended.

Refine:

- status as a discriminated union;
- category/type compatibility for original posted entries;
- date wire format;
- query range and limit;
- stored internal import lineage schema;
- tenant-scoped idempotency;
- explicit invariant that monetary fields never appear in update DTOs.

Do not add per-transaction running balance. It becomes stale when backdated entries are appended.

### 5.5 Import schemas

Add:

- strict hash formats;
- exact parsed-row cap;
- filename/column/cell length limits;
- stats refinements;
- failure metadata;
- tenant key on staged rows;
- includable-row state refinement;
- a versioned mapping/parser contract so future parser changes are reproducible.

Raw CSV rows are temporary staging data and should remain TTL-expired. Do not copy them into ledger
transactions or audit metadata.

### 5.6 Asset and valuation schemas

Keep current integer basis points and milli-units. Add:

- correct liability/non-liability sign rules;
- `closedAt`;
- temporal rules;
- cursor pagination for valuations;
- idempotency for valuation writes.

Do not add a mutable `currentValueMinor` to the asset record. Latest append-only valuation remains
the source of truth.

### 5.7 Profile and authentication schemas

`user_profiles` should remain an application-owned display/locale extension. Do not add:

- password hashes;
- TOTP secrets;
- backup codes;
- passkey public keys;
- session tokens;
- `twoFactorEnabled` copied from Better Auth.

Better Auth owns those fields. Application code may expose a derived security summary such as
`twoFactorEnabled`, passkey count, and session count through a dedicated response schema without
persisting duplicates.

## 6. Keys That Should Not Be Added

Avoid schema growth that weakens the current model:

- no floating rupee amount beside `amountMinor`;
- no mutable sign field beside transaction `type`;
- no transaction delete/soft-delete key;
- no editable monetary patch fields;
- no single-document transfer amount in place of two legs;
- no running balance on every transaction;
- no mutable current asset value;
- no auth secrets in user profiles;
- no duplicated account/category display snapshots unless a concrete immutable-reporting need is
  approved;
- no generic unbounded `metadata` bags on core financial records.

## 7. Cross-Cutting Repository and Service Findings

These are not just schema keys, but they determine whether the schema is safe:

- Make every repository method `userId`-first, including worker/internal methods.
- Validate queue payloads with Zod before processing; TypeScript generics are not runtime
  validation.
- Validate account ownership during import upload, not only when commit attempts a balance delta.
- Use compare-and-set filters for every lifecycle transition and check `modifiedCount`.
- Add audit events for account/category/profile mutations, not only ledger/assets/import chunks.
- Do not allow ordinary new postings to archived accounts, but allow mandatory compensating
  corrections.
- Repository schemas for Mongo documents should be strict enough to validate fields the method
  relies on; do not silently ignore malformed internal lineage.
- Use the same canonical request hash when implementing idempotency replay.

## 8. Proposed Implementation Sequence

After review, split the work into small changes:

1. Decide the opening-balance formula, archive reversal behavior, and passkey/auth schema policy.
2. Add canonical shared primitives and strict ISO/date/query refinements.
3. Fix import tenant keys and all `userId`-first repository methods.
4. Redesign import commit/finalization state transitions and concurrency tests.
5. Add tenant-scoped/general mutation idempotency.
6. Introduce transaction discriminated state and category-kind validation.
7. Add asset sign/temporal/closure rules.
8. Add typed audit schema and missing mutation audit writes.
9. Add query-aligned indexes in a dedicated migration after `explain()` evidence.
10. Add phased Mongo validators after existing-data audit.
11. Add real pagination to imports/valuations and decide bounded reference-list exceptions.
12. Regenerate OpenAPI/client and run all tenancy, invariant, concurrency, integration, and e2e
    gates.

Do not combine all twelve into one commit or one migration.

## 9. Required Review Decisions

Please approve or change these before implementation:

- Is `balanceMinor = openingBalanceMinor + effective ledger delta` the official invariant?
- May archived accounts receive only reversal/import-revert balance updates?
- Should idempotency use one shared `idempotency_records` collection or per-resource keys?
- Are account/category names case-insensitive, and may archived names be reused?
- Must a category parent have the same kind and be a root category?
- Is zero a valid value for a loan liability before it is closed?
- May a user intentionally override CSV dedupe, or must duplicate rows always remain excluded?
- Which small reference lists, if any, are exempt from cursor pagination?
- Should internal import lineage be exposed in transaction API responses or remain internal?
- Can the historical index drop in migration 010 be accepted as a documented exception to the
  current no-drop rule?

## 10. Definition of Done for the Later Implementation

- all new/changed request schemas reject unknown and malformed fields as designed;
- all money fields use canonical safe-integer schemas;
- every Mongo repository query is tenant-scoped with `userId` first;
- every mutation is idempotent and audited according to its contract;
- transaction state combinations are valid at Zod and Mongo boundaries;
- import state is safe under retry, crash, and at least five concurrent identical attempts;
- archived-account reversals work without allowing ordinary archived-account posting;
- query indexes match filters and sort order under `explain()`;
- validators are proven against existing data before enforcement;
- OpenAPI and generated client are updated together;
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` pass;
- `pnpm test:e2e` passes for changed routes/auth;
- every integration/e2e money test ends with the project invariant checks.

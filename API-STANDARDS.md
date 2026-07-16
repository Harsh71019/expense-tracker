# Vyaya — API Response & Error Code Standard

> The contract every endpoint follows — success shapes, error shapes, status mapping, and the error-code catalog. Referenced by `BACKEND.md` §7, enforced by the global exception filter, `packages/shared` types, contract tests, and the generated client. **No endpoint may invent its own shape.**

---

## 1. Design Rules (the whole standard in six lines)

1. **Success returns the resource, not an envelope.** No `{ success: true, data: ... }` wrapper — status codes already say it succeeded; envelopes just add `.data.data` noise.
2. **Every error is RFC 7807 `application/problem+json`** with Vyaya extensions. One shape for a 401, a validation failure, and a crashed worker.
3. **Every error carries a stable machine `code`.** Clients branch on `code` (never on `detail` text, never on status alone). Codes are append-only forever.
4. **Every response carries `x-request-id`.** Success or failure — it's the correlation handle (see LOGGING docs).
5. **Errors say whether retrying can help** (`retryable: boolean`). The frontend's retry/backoff logic reads this, not a hardcoded status list.
6. **Shapes live once, in `packages/shared`** as zod schemas → the API validates output in dev/test, the client gets the types, MSW mocks can't drift.

---

## 2. Success Responses

### 2.1 Single resource — the object, directly
```jsonc
// GET /api/v1/transactions/665f1c... → 200
{
  "id": "665f1c0a9b3e2f0012ab34cd",
  "accountId": "664a...", "categoryId": "6621...",
  "type": "expense",
  "amountMinor": 2000, "currency": "INR",
  "occurredAt": "2026-07-13T08:42:00.000Z",
  "description": "chai",
  "status": "posted",
  "source": "manual",
  "createdAt": "...", "updatedAt": "..."
}
```
Conventions: `id` not `_id`; ISO-8601 UTC dates; paise integers (`amountMinor`); enums as the shared const unions; `null` only for "explicitly cleared", absent for "not applicable"; internal fields (`dedupeHash`, `__v`) never serialize — DTO mapping is explicit, not `toJSON()` spray.

### 2.2 Creation — `201` + `Location`
```
201 Created
Location: /api/v1/transactions/665f1c...
x-request-id: a1b2c3d4
```
Body: the created resource (clients shouldn't need a follow-up GET).

### 2.3 Idempotent replay — `200` + marker header
Same `Idempotency-Key` seen again → the **original** resource, `200` (not `201`), plus:
```
Idempotency-Replayed: true
```
The frontend treats it as success (it is), and the offline-sync drain uses the header to distinguish "landed earlier" for its diagnostics.

### 2.4 Lists — the one envelope that exists
```jsonc
// GET /api/v1/transactions?limit=50&cursor=eyJv...
{
  "items": [ /* resources */ ],
  "pageInfo": {
    "nextCursor": "eyJvY2N1cnJlZEF0IjoiLi4uIn0",   // opaque base64; null when exhausted
    "hasMore": true,
    "limit": 50
  }
}
```
No `totalCount` by default (a growing ledger makes COUNT a tax on every page); endpoints that truly need it expose `?withTotal=true` and document the cost.

### 2.5 Async acceptance — `202`
Long work (import parse) returns `202` with a pollable resource:
```jsonc
{ "batchId": "...", "status": "staged_pending", "poll": "/api/v1/imports/665.../preview" }
```

### 2.6 Deletes/archives — `200` with the updated resource (archive flips a flag — this API has almost no true deletes), or `204` for the rare genuine removal (e.g. a staged row).

---

## 3. Error Response — RFC 7807 + Vyaya Extensions

Content-Type: `application/problem+json`. Always this shape:

```jsonc
// POST /api/v1/transactions/665f.../reverse → 409
{
  // ---- RFC 7807 standard members ----
  "type": "https://vyaya.app/problems/txn.already_reversed",  // stable URI; resolvable to docs later, opaque id today
  "title": "Transaction already reversed",                     // human, generic per code, never dynamic
  "status": 409,
  "detail": "Transaction 665f1c… was reversed by 665f1d… on 2026-07-10.",  // human, specific, safe to show
  "instance": "/api/v1/transactions/665f1c0a9b3e2f0012ab34cd/reverse",

  // ---- Vyaya extensions ----
  "code": "txn.already_reversed",     // THE field clients branch on
  "reqId": "a1b2c3d4",
  "timestamp": "2026-07-13T08:42:01.412Z",
  "retryable": false,
  "errors": null                      // non-null only for validation (below)
}
```

### 3.1 Validation errors — `422` with field pointers
```jsonc
{
  "type": "https://vyaya.app/problems/common.validation_failed",
  "title": "Validation failed", "status": 422,
  "detail": "2 fields failed validation.",
  "code": "common.validation_failed",
  "reqId": "…", "retryable": false,
  "errors": [
    { "path": "amountMinor", "code": "too_small",      "message": "Amount must be at least 1 paisa" },
    { "path": "occurredAt",  "code": "invalid_date",   "message": "Not a valid ISO date" }
  ]
}
```
`path` matches the request DTO field names exactly — this is what lets react-hook-form `setError` map server errors onto the right inputs with zero translation. `errors[].code` values come straight from zod issue codes plus our custom refinements.

### 3.2 What errors never contain
Stack traces, internal class names, Mongo error text, file paths, other users' identifiers, secrets. A `500`'s `detail` is always the generic "An unexpected error occurred. Reference: {reqId}." — the reqId recovers everything server-side (LOGGING-BACKEND §7); the wire recovers nothing.

---

## 4. HTTP Status Mapping (closed set — using a status not in this table is a review flag)

| Status | Meaning here | `retryable` | Typical codes |
|---|---|---|---|
| 400 | Malformed request (bad JSON, bad cursor) | no | `common.malformed_request`, `common.invalid_cursor` |
| 401 | No/expired session | no (re-auth) | `auth.unauthenticated`, `auth.session_expired` |
| 403 | Authenticated but not allowed | no | `auth.forbidden`, `auth.signup_disabled` |
| 404 | Not found **or not yours** (tenancy — never reveal existence) | no | `common.not_found` |
| 409 | State conflict | no | `txn.already_reversed`, `import.already_committed`, `common.idempotency_conflict` |
| 413 | Payload too large | no | `import.file_too_large` |
| 415 | Wrong content type | no | `import.unsupported_file_type` |
| 422 | Well-formed but invalid | no | `common.validation_failed`, `txn.account_archived` |
| 429 | Rate limited (+ `Retry-After`) | **yes** | `common.rate_limited` |
| 500 | Unexpected failure | no | `common.internal` |
| 503 | Dependency down (+ `Retry-After`) — Redis gone for import submit, Mongo txn exhausted retries | **yes** | `common.dependency_unavailable` |

Notes: **404 for cross-tenant access, not 403** — a 403 confirms the resource exists. `common.idempotency_conflict` (409) is the rare *misuse* case — same key, **different payload**; same key + same payload is the happy replay in §2.3.

---

## 5. Error Code Catalog

Codes are `domain.reason`, lowercase snake, defined once:

```ts
// packages/shared/src/errors/codes.ts
export const ErrorCodes = [
  // common
  'common.validation_failed', 'common.malformed_request', 'common.invalid_cursor',
  'common.not_found', 'common.rate_limited', 'common.idempotency_conflict',
  'common.internal', 'common.dependency_unavailable',
  // auth
  'auth.unauthenticated', 'auth.session_expired', 'auth.forbidden',
  'auth.invalid_credentials', 'auth.signup_disabled', 'auth.passkey_failed',
  // accounts
  'account.archived', 'account.has_transactions',
  // transactions
  'txn.already_reversed', 'txn.is_reversal', 'txn.account_archived',
  'txn.monetary_edit_forbidden',
  // transfers
  'transfer.same_account', 'transfer.leg_revert_forbidden',
  // imports
  'import.file_too_large', 'import.unsupported_file_type', 'import.row_limit_exceeded',
  'import.duplicate_file', 'import.not_staged', 'import.already_committed',
  'import.already_reverted', 'import.mapping_invalid',
  // income / salary
  'income.profile_ended', 'income.version_effective_conflict',
  'income.event_already_posted', 'income.no_effective_version',
  // recurring / budgets
  'recurring.rule_paused', 'budget.exists_for_category',
] as const;
export type ErrorCode = typeof ErrorCodes[number];
```

**Catalog rules:**
- **Append-only, forever.** Never rename, never reuse, never delete — old clients and old GlitchTip issues reference them. Obsolete codes get a `@deprecated` comment and stay.
- Adding a code = one PR touching: this union, the domain error class, the `title` map, and a contract test asserting it round-trips. The union type makes a typo'd code a compile error on both sides.
- Frontend `lib/errors.ts` maps `code → AppError subclass` and `code → user-facing message` (en-IN copy lives client-side; `detail` is the fallback). Components switch on class/code — a raw status-code check in a component is a lint error.

## 6. Implementation (where the standard is enforced)

```
domain error classes (common/errors)      one class per family, carries {code, status, retryable}
        ↓ thrown by services
GlobalExceptionFilter                     the ONLY place problem+json is built:
        - AppError        → its own mapping
        - ZodError        → 422 + errors[] pointers
        - Mongo 11000     → idempotency replay path or 409 conflict
        - BullMQ/timeouts → 503 retryable
        - anything else   → 500 generic + GlitchTip + full log
        ↓
problem+json schema (packages/shared)     zod-validated in dev/test: a malformed error response FAILS TESTS
```

Services throw domain errors (`throw new AlreadyReversedError(txnId, reversedBy)`); they never build responses, never know HTTP. Controllers never try/catch for shaping. One filter, one shape, no drift.

## 7. Cross-Cutting Headers

| Header | Direction | Rule |
|---|---|---|
| `x-request-id` | both | echoed if supplied, generated otherwise; on **every** response |
| `Idempotency-Key` | request | required on all mutations (see BACKEND §3.4) |
| `Idempotency-Replayed` | response | `true` on §2.3 replays |
| `Retry-After` | response | mandatory on 429/503 (seconds) |
| `Deprecation` + `Sunset` | response | set on deprecated routes ≥90 days before removal; the generated client logs a dev warning when seen |
| `Location` | response | on every 201 |

## 8. Contract Tests (what keeps this true)

- E2E suite triggers **every code in the catalog at least once** (a table-driven "error zoo" spec) and validates each response against the shared problem+json zod schema — an unreachable code is either dead (deprecate) or untested (fix).
- OpenAPI documents the problem shape + per-endpoint possible codes; `oasdiff` gate means removing a documented code from an endpoint is a breaking change by definition.
- MSW handlers for frontend tests are generated from the same schemas — the frontend cannot pass tests against an error shape the backend wouldn't produce.

**Summary:** resources out, one list envelope, problem+json in, stable `code` to branch on, `retryable` to act on, `reqId` to debug with — defined once in shared, enforced in one filter, proven by the error zoo.

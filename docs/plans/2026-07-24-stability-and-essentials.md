# Stability and Essential-Feature Ticket Set

Audited against the repository on 2026-07-24. This list supersedes the stale
“Current issues” section that still described recurring UI and auth throttling
as missing even though both are implemented.

## Delivery order

### STAB-001 — Keep reversals available after account archival

**Priority:** P0
**Status:** Complete in this change

**Problem:** `AccountRepository.applyBalanceDelta()` intentionally excludes
archived accounts. Reversal paths reused that active-account-only method, so
archiving an account could prevent transaction, transfer, and import
reversals. This violates the append-only correction model.

**Acceptance criteria:**

- New money cannot be posted to an archived account.
- A transaction on an archived account can still be reversed.
- Both legs of a transfer can still be reversed after either account is
  archived.
- A committed import can still be reverted after its account is archived.
- Balance restoration and reversal entries remain atomic.

### LEDGER-002 — Enforce category tenancy and transaction-kind integrity

**Priority:** P0
**Status:** Complete in this change

**Problem:** transaction and recurring-rule writes only checked that a category
existed. Import row edits did not validate category ownership at all. A caller
could therefore attach another user's category to a staged row, or attach an
income category to an expense.

**Acceptance criteria:**

- Manual create/update rejects a category whose kind differs from the
  transaction type.
- Recurring create/update validates the final merged template, including a
  type-only patch that retains an old category.
- Import suggestions only apply rules whose category kind matches the parsed
  row.
- Import row edits reject archived, missing, or cross-tenant categories.
- Import commit revalidates every selected category before any chunk lands, so
  stale staged data cannot bypass the invariant.
- Violations return typed RFC 7807 code `category.kind_mismatch`.

### OPS-003 — Make worker shutdown and heartbeat failure safe

**Priority:** P1
**Status:** Complete in this change

**Problem:** SIGTERM/SIGINT started queue closes without awaiting them and never
closed the Nest application context. A rejected heartbeat promise was also
unobserved.

**Acceptance criteria:**

- Heartbeat failures are caught and logged.
- Shutdown is single-flight.
- The heartbeat timer stops first.
- Both BullMQ workers are awaited before the Nest context closes.
- Queue-close failures are logged without skipping the remaining cleanup.

### IMPORT-004 — Make saved-mapping recency deterministic

**Priority:** P1
**Status:** Complete in this change

**Problem:** import batches used JavaScript millisecond timestamps and the
saved-mapping query ordered only by `createdAt`. Two rapid uploads could tie and
return the older mapping.

**Acceptance criteria:**

- Batch creation uses PostgreSQL statement timestamps with sub-millisecond
  storage precision.
- Sequential rapid uploads deterministically return the second mapping.

### API-005 — Finish idempotency coverage for every mutating endpoint

**Priority:** P1
**Status:** Open

**Scope:** import upload, staged-row patch, import commit/revert, and API-key
create/update/revoke. The import commit/revert design must retain chunking and
crash resumability; do not wrap 50,000 rows in one database transaction.

**Acceptance criteria:**

- Every mutating route requires `Idempotency-Key`.
- The key is scoped by user and operation.
- The successful domain result and idempotency record become visible
  atomically, or the operation has an equivalent resource-state replay
  protocol documented and tested.
- Five parallel identical requests produce exactly one effect and four
  replays.
- OpenAPI and the generated web client expose the required header.

### TEST-006 — Add a real authenticated API e2e suite

**Priority:** P1
**Status:** Open

**Problem:** `pnpm test:e2e` is configured with `--passWithNoTests`, and
`apps/api/test/e2e/` is empty. The command is green without exercising a route.

**Acceptance criteria:**

- Boot the HTTP API against Testcontainers PostgreSQL and Redis.
- Cover session auth, one money create/replay/reversal flow, and problem+json.
- Generate tenancy probes from the OpenAPI surface and cover all authenticated
  routes.
- Run `assertInvariants()` after every money test.
- Remove `--passWithNoTests` once the first suite lands.

### REL-007 — Pin volatile runtime and tooling dependencies

**Priority:** P1
**Status:** Open

**Problem:** production libraries and build tools use `latest`/`beta`, including
Nest, Next, Better Auth, TypeScript, ESLint integrations, and BullMQ. A clean
install can therefore change behavior without a source diff.

**Acceptance criteria:**

- Replace floating versions with exact, known-green versions.
- Recreate the lockfile from a clean install.
- Run the full verification and production builds.
- Add Renovate grouping so upgrades remain explicit reviewable changes.

### NOTIFY-008 — Close the outbox send/ack duplicate-delivery window

**Priority:** P2
**Status:** Open

**Problem:** delivery sends externally and then marks the outbox row sent. A
worker crash between those operations can resend the notification. The
database cannot make the remote side effect atomic.

**Acceptance criteria:**

- Pass a stable outbox-entry idempotency key to adapters that support it.
- Add a claim/lease state so overlapping workers do not send concurrently.
- Expired leases become retryable.
- Document at-least-once behavior for adapters without idempotency support.
- Add parallel delivery and crash-after-send tests.

### OBS-009 — Add minimum production observability

**Priority:** P2
**Status:** Open

**Scope:** Prometheus metrics for HTTP RED signals, BullMQ depth/failures,
transaction retries, worker heartbeat age, and balance drift; OpenTelemetry
traces can follow after the metrics baseline.

**Acceptance criteria:**

- Authenticated or network-restricted `/metrics`.
- Alertable gauges/counters for worker liveness, queue failures, and drift.
- No transaction descriptions, tags, cookies, tokens, or user identifiers in
  metric labels.
- A documented dashboard and alert runbook.

## Verification required for this set

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm verify:migrations
pnpm build
```

Run `pnpm test:e2e` for API-005/TEST-006 and for any later route/auth change.

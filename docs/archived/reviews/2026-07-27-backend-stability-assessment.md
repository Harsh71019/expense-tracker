# TreasuryOps Backend Stability Assessment

**Audit date:** 27 July 2026

**Scope:** `apps/api`, shared money/API contracts, backend CI, and backend runtime configuration

**Purpose:** Identify backend changes that most improve correctness, recoverability, and operational stability

**Relationship to existing work:** This assessment expands, but does not replace, `docs/plans/2026-07-24-stability-and-essentials.md`.

## Executive summary

The backend has a strong correctness foundation. Money is stored in integer paise, ledger corrections use compensating entries, monetary writes are grouped with balance and audit updates, transaction retries cover PostgreSQL serialization/deadlock failures, recurring jobs use compare-and-swap or row-locking patterns, and the notification outbox is written inside triggering transactions. The automated baseline is also healthy: strict typecheck, lint, circular-dependency analysis, 563 unit tests, and 187 PostgreSQL integration tests all pass.

The remaining stability risk is concentrated at process and workflow boundaries rather than in the ordinary ledger write path. A database or Redis stall can wait without an application-level deadline; the PostgreSQL pool is not explicitly closed by Nest shutdown; terminal BullMQ failures can leave imports or notifications permanently stuck; import upload has a database-to-queue handoff gap; large import commit/revert work still runs in the HTTP request; and several mutating routes do not yet have the required replay contract.

The recommended delivery sequence is:

1. Protect the safe-integer money boundary in PostgreSQL and aggregate parsing.
2. Add managed database lifecycle and dependency deadlines.
3. Make queue terminal states recoverable and bound Redis job retention.
4. Convert imports to a durable, asynchronous state machine.
5. Complete and harden idempotency coverage.
6. Add real authenticated API e2e coverage.
7. Pin dependencies, then add observability, scheduler coordination, and contract enforcement.

No ordinary-path ledger corruption was reproduced during this audit. The P0 item below is preventive: it closes a latent numeric boundary that can make an account unreadable if a cumulative balance exceeds JavaScript's safe-integer range.

## Current stability posture

| Area                          | Assessment                            | Evidence                                                                                                                                                                              |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger write atomicity        | Strong                                | `withTxn` is used for transaction, transfer, reversal, import chunk, recurring, goal, and budget money paths. Balance and audit writes occur in the same transaction.                 |
| Concurrency control           | Strong in core paths                  | PostgreSQL retry handling covers `40001` and `40P01`; reversal uniqueness, import dedupe hashes, recurring compare-and-swap, and budget row locks have parallel integration coverage. |
| Input and response validation | Strong                                | Shared zod schemas cover HTTP and repository output boundaries.                                                                                                                       |
| Worker recovery               | Needs improvement                     | Jobs retry, but terminal failure reconciliation, dead-letter workflow, retention, and requeue behavior are incomplete.                                                                |
| Dependency failure behavior   | Needs improvement                     | PostgreSQL pool/query deadlines and readiness time budgets are not configured; pool shutdown is unmanaged.                                                                            |
| Idempotency                   | Partial                               | Core transaction and most metadata mutations are protected; import and API-key workflows remain open, and stored keys are not bound to a request fingerprint.                         |
| Test confidence               | Strong below HTTP, incomplete at HTTP | 563 unit and 187 integration tests pass. `test:e2e` finds no files and succeeds because of `--passWithNoTests`.                                                                       |
| Observability                 | Basic                                 | Structured pino logs and request IDs exist, but metrics, alerts, job context propagation, and durable cron/queue status are absent.                                                   |
| Dependency reproducibility    | Weak on fresh resolution              | The lockfile is committed, but many runtime and tooling declarations use `latest` or a beta range.                                                                                    |

## Prioritized findings and tickets

### MONEY-010 — Enforce the JavaScript safe-integer boundary in the database

**Priority:** P0 preventive

**Risk:** A cumulative account balance or aggregate can exceed `Number.MAX_SAFE_INTEGER` even when each individual transaction is valid. PostgreSQL will accept the value, while Drizzle's `bigint(..., { mode: "number" })`, `Number(bigintString)`, and zod response parsing cannot represent it safely. The write can commit and make later account reads or verification fail.

**Evidence:**

- `packages/shared/src/transaction.ts:7` allows a single amount up to `Number.MAX_SAFE_INTEGER`.
- `apps/api/src/common/db/schema/account.ts:16-17` maps PostgreSQL `bigint` balances directly to JavaScript numbers.
- `apps/api/src/accounts/account.repository.ts:80-113` applies SQL balance deltas without a database range predicate or check constraint.
- `apps/api/src/balances/balance-verify.repository.ts:29-47` and `apps/api/src/reports/monthly-rollup.repository.ts:48-104` convert aggregate `bigint` strings with `Number(...)` without an explicit safe-integer check.

**Recommended change:**

- Add additive PostgreSQL check constraints for every money column that is represented as a JavaScript number.
- Perform balance changes using a range-guarded `UPDATE ... WHERE` and distinguish “account missing” from “result out of supported range.”
- Parse aggregate strings through a shared BigInt-based safe conversion helper that rejects out-of-range values before returning a number.
- Review all reductions that add money values in JavaScript; use BigInt intermediates where a sum can exceed a single-value bound.
- Add boundary tests at `MAX_SAFE_INTEGER`, one paise beyond it, large positive/negative balance deltas, rollups, and balance verification.

**Acceptance criteria:**

- No database money value exposed to application code can be outside the supported safe-integer range.
- An overflowing mutation rolls back its transaction and returns a typed, non-retryable domain error.
- Aggregate code never silently rounds a paise value.

### DB-011 — Manage the PostgreSQL pool lifecycle and set hard dependency deadlines

**Priority:** P1

**Risk:** The database provider creates a `pg.Pool` with only `max: 10` and returns the Drizzle wrapper. Nest has no provider that owns and closes the pool. Connection attempts, statements, lock waits, and readiness checks have no explicit application deadline, so dependency degradation can consume all request capacity or delay shutdown.

**Evidence:**

- `apps/api/src/common/db/db.module.ts:18-22` creates the pool without lifecycle ownership or timeout settings.
- `apps/api/src/health/health.service.ts:24-31` waits on PostgreSQL and Redis without a time budget.
- `apps/api/src/main.ts:45` enables Nest shutdown hooks, but the database provider has no `OnModuleDestroy` cleanup.
- `apps/api/src/worker.ts:58-77` closes workers and the Nest context, but the pool is not explicitly ended.
- `apps/api/src/main.ts:64` and `apps/api/src/worker.ts:80` launch bootstraps without a structured fatal-error handler.

**Recommended change:**

- Introduce a database client provider that owns both `Pool` and Drizzle, implements `OnModuleDestroy`, and calls `pool.end()`.
- Add validated environment settings for connection timeout, query timeout, statement timeout, lock timeout, idle-in-transaction timeout, pool size, and graceful-shutdown deadline.
- Give `/readyz` a short total budget and report which dependency failed without exposing secrets.
- On SIGTERM, stop accepting HTTP work, close workers, close Nest resources, and exit non-zero if the shutdown deadline is exceeded.
- Catch top-level bootstrap failures, log one `fatal` event, close initialized resources when possible, and set a non-zero exit code.

**Acceptance criteria:**

- A black-holed database or Redis returns readiness failure within the configured budget.
- API and worker processes exit cleanly after SIGTERM with no open PostgreSQL or Redis handles.
- A shutdown integration test verifies in-flight work is given a bounded drain window.

### QUEUE-012 — Make terminal BullMQ failures recoverable and bound Redis retention

**Priority:** P1

**Risk:** Import and notification jobs have retry/backoff, but neither queue configures completed/failed retention or a terminal-failure state transition. Deterministic job IDs are useful for dedupe, but a retained terminal job can prevent a later sweep from creating fresh work with the same ID. Notifications can remain `pending` forever, and an infrastructure failure can leave an import batch `pending` forever.

**Evidence:**

- `apps/api/src/imports/imports.queue.ts:35-45` configures attempts and backoff only.
- `apps/api/src/notifications/notifications.queue.ts:29-41` configures attempts and backoff only.
- `apps/api/src/imports/imports.processor.ts:31-36` and `apps/api/src/notifications/notifications.processor.ts:31-40` only log `failed` events.
- `apps/api/src/notifications/notification-sweep.service.ts:43-56` repeatedly enqueues the same deterministic job ID while the row is pending.

**Recommended change:**

- Define bounded `removeOnComplete` and `removeOnFail` policies sized for the home-LXC deployment.
- Distinguish retryable attempt failure from terminal exhaustion.
- On terminal import failure, persist a typed failure state and reason on the batch.
- On terminal notification failure, persist dead-letter metadata and expose an explicit requeue operation that removes/replaces the old terminal job safely.
- Add `QueueEvents`-based metrics/alerts for waiting, active, delayed, stalled, and terminal-failed jobs.
- Add a periodic reconciler for database work whose queue job is missing.

**Acceptance criteria:**

- A job that exhausts retries is visible in durable application state, not only Redis/logs.
- An operator or reconciler can retry the work successfully.
- Completed and failed job records cannot grow Redis without a bound.

### IMPORT-013 — Turn imports into a durable asynchronous state machine

**Priority:** P1

**Risk:** Upload creates the database batch and then enqueues Redis work as two separate operations. A crash or Redis error between them leaves a batch with no parse job. The parse job stores the full CSV as base64 in Redis. Commit and revert can process up to 50,000 rows in repeated transactions while holding an HTTP request open.

**Evidence:**

- `apps/api/src/imports/imports.service.ts:81-101` persists the batch before the queue handoff.
- `apps/api/src/imports/imports.queue.ts:12-20` includes base64 file bytes in job data.
- `apps/api/src/imports/imports.service.ts:279-387` runs chunked commit/revert loops directly from controller calls.
- `apps/api/src/imports/imports.controller.ts:55-133` has no job-status resource for commit/revert.

**Recommended change:**

- Persist an import command/outbox record in the same transaction as batch creation; a dispatcher publishes it to BullMQ and retries until acknowledged.
- Store uploaded bytes in a durable bounded location and put only a pointer plus integrity hash in Redis.
- Model explicit states such as `pending_parse`, `parsing`, `staged`, `commit_queued`, `committing`, `committed`, `revert_queued`, `reverting`, `reverted`, and `failed`.
- Run commit and revert in BullMQ. Keep the existing ≤200-row transactional chunks and resumability.
- Add a lease/heartbeat and progress fields so a killed worker can be detected and resumed.
- Return `202 Accepted` plus a status resource for asynchronous transitions.

**Acceptance criteria:**

- Killing the API after the batch transaction but before queue publication still converges to a parse job.
- Killing the worker during parse, commit, or revert leaves a state that automatically resumes.
- A maximum-size import never depends on an HTTP connection remaining open.
- Five identical commit/revert requests create one workflow.

### API-005 / IDEM-014 — Complete idempotency and bind keys to request intent

**Priority:** P1

**Risk:** Import and API-key mutations still lack the required idempotency protocol. The generic PostgreSQL idempotency record stores only the result, so reusing a key with a different body silently replays the first result. Records also have no retention policy.

**Evidence:**

- `apps/api/src/imports/imports.controller.ts:55-133` exposes upload, row patch, commit, and revert without `Idempotency-Key`.
- `apps/api/src/api-keys/api-keys.controller.ts:19-57` exposes create/update/revoke without the shared PostgreSQL idempotency service.
- `apps/api/src/common/idempotency/idempotency-postgres.service.ts:27-50` scopes by user, operation, and key, but receives no request fingerprint.
- `apps/api/src/common/db/schema/idempotency.ts:5-20` stores result and creation time only.

**Recommended change:**

- Finish the open API-005 scope from the existing stability plan.
- Canonicalize and hash the validated request intent, including path identifiers and body.
- Persist the fingerprint with the result; return a typed `409` when the same key is reused for different intent.
- Define a documented retention window and cleanup job for idempotency records.
- Keep resource-state replay for inherently state-addressed operations such as reversal, but expose the replay contract consistently in OpenAPI.

**Acceptance criteria:**

- Every mutating route has either required key-based idempotency or a documented equivalent resource-state replay protocol.
- Five parallel identical attempts produce one effect.
- Same key plus different intent never returns a misleading success.

### TEST-006 — Add a real authenticated API e2e suite

**Priority:** P1

**Risk:** Controllers are heavily unit tested and services have real PostgreSQL integration tests, but the deployed HTTP composition—middleware order, Better Auth, guards, multipart upload, throttling, global filters, CORS, OpenAPI contracts, and generated tenancy probes—is not exercised end to end.

**Evidence:**

- `apps/api/vitest.e2e.config.ts:3-6` targets `test/e2e/**/*.e2e.ts`.
- `apps/api/package.json:15` uses `--passWithNoTests`.
- The audit run reported “No test files found, exiting with code 0.”

**Recommended change:**

- Implement the existing TEST-006 ticket.
- Boot the built HTTP app against Testcontainers PostgreSQL and Redis.
- Cover authenticated create/replay/reverse, RFC 7807, API-key scope, multipart import handoff, and shutdown/readiness behavior.
- Generate tenancy probes from OpenAPI and fail if an authenticated route has no probe.
- Remove `--passWithNoTests`.

**Acceptance criteria:**

- `pnpm test:e2e` fails if zero tests are discovered.
- Every money e2e test ends with shared ledger invariant checks.

### REL-007 — Pin runtime and tooling dependencies exactly

**Priority:** P1

**Risk:** The committed lockfile makes current CI reproducible, but many production packages and build tools declare `latest`; TypeScript is also a beta. Any intentional lockfile refresh can introduce broad, unrelated behavior changes.

**Evidence:** `apps/api/package.json:20-59` and root `package.json:24-47` contain numerous `latest`, caret, and beta declarations.

**Recommended change:** Implement the existing REL-007 ticket: pin known-green exact versions, regenerate from a clean install, run the full suite/build, and introduce grouped automated update PRs.

### NOTIFY-008 — Close notification claim and send/ack gaps

**Priority:** P2

**Risk:** Two workers can read the same pending row before either marks it sent. More importantly, a crash after the external send and before `markSent` causes a retry and possible duplicate delivery. A process-local circuit breaker does not coordinate multiple workers.

**Evidence:**

- `apps/api/src/notifications/notification-delivery.service.ts:24-35` performs send, then database acknowledgement.
- `apps/api/src/notifications/notification-outbox.repository.ts:59-84` has no claim/lease state.

**Recommended change:** Implement the existing NOTIFY-008 ticket with a database claim/lease, stable adapter idempotency key, attempt metadata, expired-lease recovery, and documented at-least-once semantics for adapters without dedupe support.

### OBS-009 — Add actionable metrics, job correlation, and alert runbooks

**Priority:** P2

**Risk:** Logs exist, but the system cannot answer “is the queue stuck?”, “how old is the oldest pending outbox row?”, “are transaction retries rising?”, or “did a cron fail to run?” without manual inspection. Production defaults to `LOG_LEVEL=error`, suppressing normal worker lifecycle and cron summaries. Request IDs are not propagated into job data or worker logging context.

**Evidence:**

- `apps/api/src/common/config/env.ts:11` and `env.example:5` default production logging to `error`.
- Import and notification job payloads do not carry request/correlation IDs.
- Worker processors log completion/failure but do not establish `jobId`, `jobName`, or originating request context.
- There is no `/metrics` implementation.

**Recommended change:** Implement the existing OBS-009 scope, change production baseline to structured `info`, propagate a correlation ID into jobs/audit where appropriate, and document alerts for worker heartbeat age, oldest pending work, terminal failures, balance drift, transaction retry rate, dependency latency, and missing cron runs.

### SCHED-015 — Add scheduler leadership and durable run history

**Priority:** P2

**Risk:** `SERVICE_ROLE=worker` prevents the API process from running crons, but it does not prevent two worker replicas from running them simultaneously. Several jobs are concurrency-safe; others can create duplicate work or unnecessary load. There is no durable “last started/completed/failed” record.

**Recommended change:**

- Wrap each cron in a PostgreSQL advisory lock or lease keyed by job name and schedule window.
- Persist start, completion, duration, item counts, and failure summary.
- Use deterministic run IDs based on job plus IST schedule window.
- Alert on missing or overlong runs.

### TENANCY-016 — Enforce repository scoping on internal worker paths

**Priority:** P2

**Risk:** Most repositories correctly require `userId` first, but import staged-row/batch state methods and notification delivery methods often operate by resource ID alone. UUIDs reduce accidental collision risk, but consistent tenant predicates provide defense in depth against malformed queue payloads and future call-site mistakes.

**Evidence:**

- `ImportBatchRepository.markParsed`, `incrementCommittedCount`, `markCommitted`, and `markReverted` do not accept `userId`.
- `StagedRowRepository` methods scope by `batchId` but not directly by tenant.
- `NotificationOutboxRepository.findById` and `markSent` scope by outbox ID only.

**Recommended change:**

- Require `userId` first on resource-specific repository methods and include it in every filter.
- Name intentional cross-tenant sweep methods explicitly, return `{ userId, id }`, and require all follow-up operations to use both.
- Add a static architecture test and integration probes for repository tenancy.

### TEST-017 — Make invariant checks and fixture cleanup systematic

**Priority:** P2

**Risk:** The shared ledger invariant helper exists, but only two of 36 integration files call it; the auth suite has a separate profile invariant. Tests that fail during `beforeAll` also assume fixtures exist during teardown, creating secondary errors that obscure the root cause.

**Recommended change:**

- Provide one standard integration harness that registers post-test ledger, append-only, transfer-pairing, and audit invariants.
- Use it automatically in every integration/e2e file that starts a database.
- Make teardown conditional and single-flight so setup failure reports one primary error.
- Add a CI check that prevents new database integration files from bypassing the harness.

## Strengths to preserve

- Do not weaken `withTxn`, the read-committed rationale, or the deadlock/serialization retry behavior.
- Preserve append-only transaction corrections and account-balance updates in the same transaction.
- Preserve database uniqueness for transaction idempotency, reversal pairing, import dedupe hashes, recurring claims, and budget alert events.
- Preserve the transactional notification outbox; improve only dispatch and delivery recovery.
- Preserve the ≤200-row import transaction chunks.
- Preserve zod parsing at HTTP, queue, and repository output boundaries.
- Preserve the 95% backend unit coverage gate and sequential integration-file execution.

## 30/60/90-day implementation roadmap

### Days 0-30: stop permanent stalls and numeric boundary failures

1. MONEY-010 safe-integer checks and boundary tests.
2. DB-011 pool ownership, deadlines, readiness budget, and shutdown tests.
3. QUEUE-012 terminal state handling, retention, and requeue.
4. API-005 idempotency coverage for import/API-key mutations.

**Exit gate:** dependency outages fail within a bounded time; no queue failure can remain invisible or unrecoverable; all mutating routes have a replay contract.

### Days 31-60: make long workflows crash-resumable

1. IMPORT-013 durable dispatch plus asynchronous commit/revert.
2. TEST-006 authenticated API e2e suite.
3. NOTIFY-008 claim/lease and adapter idempotency.
4. REL-007 exact dependency pinning.

**Exit gate:** maximum-size imports survive API/worker kills; HTTP e2e verifies auth, replay, error mapping, and tenancy.

### Days 61-90: make degradation visible before users notice

1. OBS-009 metrics, correlation, dashboards, and alerts.
2. SCHED-015 leadership and run history.
3. TENANCY-016 repository contract enforcement.
4. TEST-017 automatic invariants and resilient fixtures.

**Exit gate:** queue backlog, stale heartbeat, dependency latency, missing cron, transaction retries, and balance drift all have an owner-visible signal and runbook.

## Verification performed for this assessment

| Command                                            | Result                                               |
| -------------------------------------------------- | ---------------------------------------------------- |
| `pnpm --filter @treasury-ops/api lint`             | Pass                                                 |
| `pnpm --filter @treasury-ops/api typecheck`        | Pass                                                 |
| `pnpm --filter @treasury-ops/api check:circular`   | Pass; no circular dependency                         |
| `pnpm --filter @treasury-ops/api test`             | Pass; 116 files, 563 tests                           |
| `pnpm --filter @treasury-ops/api test:integration` | Pass with Docker/Testcontainers; 36 files, 187 tests |
| `pnpm --filter @treasury-ops/api test:e2e`         | Command exits 0, but no test files are present       |

This was a code and automated-test audit. It did not include production log review, live database/Redis capacity inspection, load testing, network fault injection, backup restoration, or a kill-during-deploy exercise. Those should be performed after the first 30-day changes because the new timeouts, terminal states, and metrics will make the exercises measurable.

## Definition of stable for the backend

The backend should be considered stable when:

- every accepted money mutation is atomic, replay-safe, tenant-scoped, and within the supported integer range;
- every asynchronous command is durably recorded before acknowledgement, resumable after a kill, and visible in a terminal state;
- every dependency call and shutdown path has a bounded deadline;
- every mutating HTTP route has a tested replay contract;
- a zero-test e2e run cannot be green;
- queues, crons, worker heartbeats, transaction retries, and balance drift are observable and alertable;
- full lint, strict typecheck, unit, integration, e2e, migration verification, and production build gates pass.

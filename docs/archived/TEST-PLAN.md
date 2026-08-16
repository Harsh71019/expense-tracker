# TreasuryOps — Test Plan (Enterprise-Grade)

> Companion to `BACKEND.md` and `IMPLEMENTATION-PLAN.md`. Philosophy: **the ledger's correctness is the product** — so the test suite is organized around _invariants that must never break_, then the standard pyramid around them. Tooling: Vitest (unit/property), mongodb-memory-server in replica-set mode (integration — transactions need a replset), Testcontainers + Supertest (e2e), fast-check (property-based), k6 (load), a small chaos harness (process-kill scripts).

---

## 0. The Five Invariants (tested at every level)

| #      | Invariant        | Meaning                                                                                                                                                                 |
| ------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I1** | **Conservation** | For every account: `openingBalance + Σ(signed posted+reversal txns) === balanceMinor` cache. Always.                                                                    |
| **I2** | **Append-only**  | No transaction document's monetary fields (`amountMinor`, `type`, `accountId`, `occurredAt`) are ever mutated; no transaction is ever deleted.                          |
| **I3** | **Pairing**      | Every `reversal` has exactly one `reversalOf` target whose `reversedBy` points back; every transfer group has exactly 2 legs with equal amounts and opposite direction. |
| **I4** | **Exactly-once** | Any logical action (idempotency key, recurring `ruleId+date`, import row `dedupeHash`) lands at most once regardless of retries, crashes, or double submissions.        |
| **I5** | **Tenancy**      | No query path returns or mutates data where `doc.userId !== session.userId`.                                                                                            |

A shared `assertInvariants(db, userId)` helper runs I1–I3 as a post-condition in every integration/e2e test — cheap, and it catches whole classes of bugs the specific assertion missed.

---

## 1. Unit Tests (fast, no I/O — target < 5s total)

**Money & parsing (property-based with fast-check)**

- `toMinor/fromMinor` round-trips for all representable amounts; no float ever appears (`Number.isInteger` asserted).
- Parser accepts `"1,250.50"`, `"1250.5"`, `"₹1,250"`, `"1,25,000.00"` (Indian digit grouping); rejects `"12.505"`, `""`, `"1e5"`, negatives where sign is illegal.
- Property: `parse(format(x)) === x` for 10k random paise values.

**Dedupe hash**

- Stable across whitespace/case/UPI-ref noise in description; **changes** when date-day, amount, or account changes.
- Documented collision case: two genuinely identical same-day txns → identical hash (that's why preview flags rather than drops — test asserts the flag).

**Date & timezone**

- `DD/MM/YYYY` strict parsing; `31/02/2026` rejected, not rolled over. All boundaries computed in `Asia/Kolkata`: a txn at `2026-07-31T23:30 IST` belongs to July's rollup even though it's August in UTC.

**rrule engine**

- Monthly on the 31st → lands on 30/28 in short months (rrule semantics pinned by test); paused rule never yields; `nextRunAt` advancement is deterministic.

**Category rule engine**

- Priority ordering, case-insensitivity, user-rule overrides preset; interface contract tests that the future embedding classifier must also pass.

**Pure services** (with mocked repos): reversal status guards (reverse-a-reversal → domain error; double-reverse → domain error), transfer leg construction, pagination cursor encode/decode (opaque, tamper-rejecting).

---

## 2. Integration Tests (mongodb-memory-server, replica-set mode)

Real Mongoose models, real transactions, no HTTP layer.

**Transactionality (the `withTxn` proof)**

- Induced throw after txn insert but before balance `$inc` → **zero** documents persisted (I1, I2).
- Induced `TransientTransactionError` (via failpoint-style mock) → `withTransaction` retries and succeeds exactly once (I4).
- 16MB-adjacent batch: 200-row chunk commits succeed; 10k-row commit uses ≥50 transactions, never one.

**Concurrency (the tests that earn the "enterprise" label)**

- **Double-submit:** 10 parallel creates with the same idempotency key → exactly 1 document, 1 balance change; 9 callers receive the original result (I4).
- **Concurrent reverse:** 5 parallel reversals of the same txn → exactly 1 reversal entry, others get status-guard error (I3, I4).
- **Interleaved writes:** 100 parallel mixed creates/reversals on one account → final balance equals sequential-replay expectation (I1). Run 20× in CI (race bugs are probabilistic).
- **Concurrent import commit:** the same batch committed from two workers simultaneously → row count exact, no dupes (dedupeHash unique index is the arbiter).

**Import pipeline**

- CSV fixture corpus in-repo: HDFC savings, ICICI credit card, debit/credit-column variant, UTF-8 BOM, CRLF, quoted commas in narration, 50k-row cap breach, header-only, malformed rows mixed with good ones (good rows stage; bad rows carry `problems`, never crash the job).
- **Resumability:** kill (reject promise / process.exit in worker harness) after chunk 2 of 5 → batch stays `staged`, re-run commits exactly the remaining rows (I4), final state identical to uninterrupted run.
- **Batch revert:** post-revert balance equals pre-import balance to the paisa; every batch txn has status `reversed` with a paired reversal (I1, I3); reverting twice → error.

**Crons**

- Recurring materializer fired twice for the same date (simulated double cron) → one posted txn (I4).
- `balances.verify` detects an artificially corrupted cache and reports drift; rollup refresh is idempotent (run 3×, same document).
- Outbox: notification row written in-txn with the triggering change; a rolled-back change leaves no outbox row; drain retries on adapter failure and stops at circuit-open.

**Migrations**

- Full `migrate-mongo` up on empty replset in CI; `explain()` query-budget suite: 5 hottest queries must use an index (fail on COLLSCAN).

---

## 3. E2E / API Tests (Testcontainers: api + worker + redis + replset)

Black-box through HTTP with a real session cookie.

**Auth flows:** signup→login→session cookie→access; logout kills session; expired session → 401; signup disabled after first user; throttler → 429 on 11th login/min; cookie flags asserted (`httpOnly`, `secure`, `sameSite`).

**Tenancy probes (I5) — auto-generated:** the suite reflects over the OpenAPI spec and, for **every** authenticated route, attempts access to user B's resource with user A's session, asserting 403/404. New endpoints are covered by construction, not by memory.

**Golden paths:** create→list→reverse cycle; transfer→group-revert; full import lifecycle upload→preview→untick→commit→export→revert; each ends with `assertInvariants`.

**Contract tests:** responses validated against the OpenAPI spec (`jest-openapi`-style matcher); problem+json shape on every error class; `oasdiff` breaking-change gate vs the last released spec.

**Security-focused e2e:**

- CSV upload: 6 MB file → 413; `.csv.exe` / wrong MIME → 415; formula-injection cells in export are neutralized (`'=SUM(...)`).
- NoSQL injection probes: `{"$gt": ""}` in query params rejected by zod, never reaches Mongo.
- Headers: helmet set (CSP, HSTS, nosniff), CORS rejects foreign origin preflight.
- Audit immutability: no route mutates `audit_log`; direct-write attempt blocked by JSON-schema validator.

---

## 4. Load & Performance (k6, run against staging LXC)

| Scenario             | Profile                        | Pass criteria                                                           |
| -------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| Steady writes        | 50 VUs, 200 writes/s, 5 min    | p95 < 150 ms, error rate 0, I1 holds after                              |
| Read-heavy dashboard | 100 VUs on reports             | p95 < 100 ms (rollup+cache path), cache hit ratio > 90%                 |
| Import burst         | 3 concurrent 5k-row imports    | each commits < 30 s, queue drains, no DLQ entries                       |
| Mixed chaos-adjacent | writes + reverses + one import | invariants hold, no txn retry storm (retry count metric < 2% of writes) |
| Soak                 | 10 writes/s for 2 h            | zero memory growth trend, no connection-pool exhaustion                 |

Every k6 run ends with the **balance-verify job** against the test dataset — load testing a ledger without reconciling afterwards is theater. Reports committed to `perf/` in the repo for trend comparison.

---

## 5. Chaos & Recovery Drills (scripted, run per release + quarterly)

1. **SIGTERM during in-flight write** → request completes or cleanly 503s; zero partial state.
2. **SIGKILL worker mid-import-commit** → resume completes batch exactly (the I4 flagship drill).
3. **Redis down** → API serves reads/writes (cache-miss path), imports queue when it returns; no request failures except import submission (clean 503 + retry-after).
4. **Atlas primary stepdown** (`rs.stepDown()` on local replset / Atlas test failover) → `withTransaction` retries absorb it; error rate blip < 5 s.
5. **Restore drill:** latest mongodump → `treasury-ops-drill` → run balance-verify → zero drift → document restore time vs the 1h RTO.
6. **Rollback drill:** deploy previous image tag on staging → smoke suite green (proves migrations stayed backward-compatible).

---

## 6. CI Gates & Quality Bars

```
PR:      lint → typecheck → unit → integration → e2e → coverage gate → oasdiff → trivy
nightly: full e2e + query-budget explain() suite + dependency audit
release: all of the above + k6 smoke on staging + chaos drills 1–3 (scripted)
```

- **Coverage:** 90% lines on `transactions/`, `imports/`, `common/` (the money paths); 75% overall. Coverage on money paths is a _gate_, elsewhere a metric.
- **Mutation testing (Stryker) on money utils + reversal service only** — the two files where a surviving mutant means silent money corruption. Run weekly, not per-PR (it's slow).
- **Flake policy:** a test that fails then passes on retry is quarantined into `flaky/` with an issue — never deleted, never retried-to-green silently.
- **Test data:** builders/factories (`aTxn().expense().rupees(1250.50).build()`), no shared mutable fixtures; every integration test gets a fresh database name.

---

## 7. Traceability Matrix (what proves what)

| Risk                                     | Killed by                                            |
| ---------------------------------------- | ---------------------------------------------------- |
| Partial write corrupts balance           | §2 transactionality + I1 post-conditions everywhere  |
| Double-tap on train Wi-Fi double-posts   | §2 double-submit + §3 golden path with duplicate key |
| Crash mid-import duplicates rows         | §2 resumability + chaos drill 2                      |
| Cron double-fire double-posts rent       | §2 cron idempotency                                  |
| Cross-user data leak (future multi-user) | §3 auto-generated tenancy probes                     |
| Report shows wrong month (IST/UTC)       | §1 timezone boundary units + rollup integration      |
| Index regression slows hot path          | §2 query-budget `explain()` suite                    |
| Backup that doesn't restore              | §5 drill 5, quarterly                                |
| Breaking API change ships silently       | §3 contract tests + `oasdiff` gate                   |
| "It worked under no load"                | §4 k6 with post-run reconciliation                   |

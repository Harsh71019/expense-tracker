# PR #14 Review — Migrate Datastore to PostgreSQL

PR: [Harsh71019/expense-tracker#14](https://github.com/Harsh71019/expense-tracker/pull/14)  
Branch: `feat/migrate-to-sql`  
Review conclusion: **Request changes**

## Findings

### 1. P1 — Add a production data cutover

The deployment runs Drizzle schema migrations against a fresh PostgreSQL database and then starts application code that no longer reads MongoDB. There is no process that migrates existing Better Auth users, profiles, accounts, ledger transactions, audit entries, imports, recurring rules, or other production records.

Consequences:

- Existing users may be unable to sign in.
- The application will appear empty after deployment.
- Ledger history and audit data will remain stranded in MongoDB.

Required changes:

- Add a tested MongoDB-to-PostgreSQL backfill.
- Preserve relationships while converting ObjectIds to UUIDs.
- Migrate authentication records without invalidating credentials or sessions unexpectedly.
- Verify row counts, account balances, ledger invariants, transfer/reversal pairing, and audit history before cutover.
- Document a rollback procedure and prevent application startup if migration verification fails.

Relevant code: `docker-compose.yml`, particularly the one-shot `migrate` service.

### 2. P1 — Make final recurring occurrences concurrency-safe

When `computeNextOccurrence()` returns `null`, the materializer passes the current `nextRunAt` back to `claimRun()` as the new value. The claim therefore does not change the field used by its compare-and-swap predicate.

Under PostgreSQL `read committed` isolation, a concurrent update waiting on the same row re-evaluates its predicate after the first transaction commits. It can still match because:

- `next_run_at` remains unchanged; and
- `is_paused` is not included in the claim predicate.

Both transactions can consequently post the final recurring transaction.

Required changes:

- Use a claim state that changes irreversibly, or add a deterministic unique idempotency key based on the rule ID and scheduled date.
- Include the active/paused state in the claim predicate where appropriate.
- Add a test that concurrently materializes a `COUNT=1` rule at least five times and asserts exactly one ledger effect.

Relevant code: `apps/api/src/recurring/recurring-rule.repository.ts` and `apps/api/src/recurring/recurring-materialize.service.ts`.

### 3. P1 — Preserve the valid money range in SQL aggregates

Balance verification and monthly rollups cast ledger sums to PostgreSQL `int4` using `::int`. PostgreSQL `int4` is limited to 2,147,483,647, while the shared schemas allow individual money values up to `Number.MAX_SAFE_INTEGER`. A single valid transaction—or the sum of many smaller transactions—can exceed the SQL cast limit.

This can make balance verification and report generation fail with a numeric-out-of-range error.

Required changes:

- Keep aggregates as `bigint` or `numeric`.
- Convert database results to JavaScript numbers explicitly after validating the safe-integer range.
- Alternatively, configure a safe `pg` parser for the affected result type.
- Add balance-verification and rollup tests whose totals exceed the `int4` limit.

Relevant code:

- `apps/api/src/balances/balance-verify.repository.ts`
- `apps/api/src/reports/monthly-rollup.repository.ts`

### 4. P1 — Do not publish PostgreSQL on every host interface

The production Compose file publishes `5433:5432`, which binds PostgreSQL to all host interfaces by default. This exposes the financial database outside the private Compose network and contradicts the deployment design stating that nginx is the only exposed container.

Required changes:

- Remove the published PostgreSQL port from the production Compose file; or
- Put local port publishing in a development-only Compose override and bind it to `127.0.0.1`.

Relevant code: `docker-compose.yml`.

### 5. P1 — Restore backups before moving production state

The migration moves the primary database from managed Atlas storage to a local Docker volume, but the deployment documentation still describes `mongodump` using the removed `MONGODB_URI`. No PostgreSQL backup and restore workflow is included.

Required changes:

- Add an automated `pg_dump` backup job.
- Preserve the documented daily/monthly retention and offsite-copy strategy.
- Document and test restoration into a clean PostgreSQL instance.
- Run ledger invariant and balance verification after restore.
- Update `docs/DEPLOYMENT-VYAYA.md`, README, backend documentation, and operational commands.

Relevant code and documentation:

- `docker-compose.yml`
- `docs/DEPLOYMENT-VYAYA.md`
- `README.md`
- `docs/backend/BACKEND.md`

### 6. P2 — Enforce uniqueness for root categories

The category unique index covers `(user_id, parent_id, name)`. A normal PostgreSQL unique index treats `NULL` values as distinct, so it allows multiple root categories with the same user and name when `parent_id` is `NULL`. This differs from the previous MongoDB behavior.

Required changes:

- Use `NULLS NOT DISTINCT` on PostgreSQL 18; or
- Add separate partial unique indexes for root and child categories.
- Add an integration test that attempts to create two same-named root categories for one user.

Relevant code: `apps/api/src/common/db/schema/category.ts` and the generated Drizzle migration.

## Validation performed

After installing the branch dependencies from the committed lockfile:

- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — passed: 441 tests across shared, API, and web.
- `pnpm build` — passed.
- GitHub CI and GitGuardian checks — passed at review time.
- `pnpm test:integration` — could not run locally because no compatible container runtime was available. Testcontainers failed before starting PostgreSQL, so all 127 integration tests were skipped locally; GitHub CI reported the integration suite passing.

## Recommended merge gate

Do not merge until the five P1 findings are resolved and covered by integration or operational verification. The P2 root-category uniqueness regression should also be fixed in the initial PostgreSQL schema so production does not require a corrective migration immediately after cutover.

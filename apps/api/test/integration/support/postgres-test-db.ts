import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

import * as authSchema from "../../../src/common/db/auth-schema.js";
import { user } from "../../../src/common/db/auth-schema.js";
import * as schema from "../../../src/common/db/schema/index.js";
import type { DrizzleDb } from "../../../src/common/db/db.module.js";

const fullSchema = { ...schema, ...authSchema };
const activeTestDbs = new Set<TestDb>();

export type TestDb = Readonly<{
  db: DrizzleDb;
  connectionUri: string;
  teardown: () => Promise<void>;
}>;

/**
 * One container per test file (call in `beforeAll`), migrations applied
 * once at startup — mirrors how MongoMemoryReplSet.create() gave each test
 * file its own isolated instance. Postgres startup is slower than Mongo's
 * in-memory server; acceptable per-file, not per-test.
 * `connectionUri` is exposed for tests (e.g. bootstrap.integration.ts) that
 * need to point a *real* DbModule provider at this same container via
 * `process.env.DATABASE_URL`, rather than constructing repositories by hand
 * against `db`.
 */
export async function createTestDb(): Promise<TestDb> {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: Pool | undefined;
  try {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("treasury_ops_test")
      .start();

    const connectionUri = container.getConnectionUri();
    pool = new Pool({ connectionString: connectionUri });
    const db = drizzle(pool, { schema: fullSchema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    await installInvariantGuards(db);
    const startedContainer = container;
    const startedPool = pool;

    let teardownPromise: Promise<void> | undefined;
    const testDb: TestDb = {
      db,
      connectionUri,
      teardown: () => {
        teardownPromise ??= (async () => {
          activeTestDbs.delete(testDb);
          try {
            await startedPool.end();
          } finally {
            await startedContainer.stop();
          }
        })();
        return teardownPromise;
      }
    };
    activeTestDbs.add(testDb);
    return testDb;
  } catch (error) {
    if (pool !== undefined) await ignoreCleanupFailure(pool.end());
    if (container !== undefined) await ignoreCleanupFailure(container.stop());
    throw error;
  }
}

async function installInvariantGuards(db: DrizzleDb): Promise<void> {
  await db.execute(sql`
    create or replace function test_reject_transaction_ledger_mutation()
    returns trigger
    language plpgsql
    as $$
    begin
      if tg_op = 'DELETE' then
        raise exception 'integration invariant: transaction rows are append-only';
      end if;
      if old.amount_minor is distinct from new.amount_minor
        or old.type is distinct from new.type
        or old.account_id is distinct from new.account_id
        or old.occurred_at is distinct from new.occurred_at then
        raise exception 'integration invariant: transaction monetary fields are immutable';
      end if;
      return new;
    end;
    $$;
  `);
  await db.execute(sql`
    create trigger test_transactions_append_only
    before update or delete on transactions
    for each row execute function test_reject_transaction_ledger_mutation();
  `);
  await db.execute(sql`
    create or replace function test_reject_audit_mutation()
    returns trigger
    language plpgsql
    as $$
    begin
      raise exception 'integration invariant: audit rows are write-once';
    end;
    $$;
  `);
  await db.execute(sql`
    create trigger test_audit_log_write_once
    before update or delete on audit_log
    for each row execute function test_reject_audit_mutation();
  `);
}

export function activeIntegrationTestDbs(): readonly TestDb[] {
  return [...activeTestDbs];
}

export async function teardownActiveIntegrationTestDbs(): Promise<void> {
  await Promise.all([...activeTestDbs].map((testDb) => testDb.teardown()));
}

async function ignoreCleanupFailure(cleanup: Promise<unknown>): Promise<void> {
  await cleanup.catch(() => undefined);
}

/**
 * Every domain table's `userId` column is a real FK to Better Auth's
 * `user` table now (unlike Mongo, which had no referential integrity) --
 * a test that inserts a domain row for an arbitrary userId string (e.g.
 * "user-a") needs a matching `user` row to exist first, or Postgres
 * rejects the insert with a foreign key violation. Call this in
 * `beforeAll`/`beforeEach` for every userId a test is about to write
 * data under. Idempotent (`onConflictDoNothing`) so it's safe to call
 * more than once for the same id.
 */
export async function insertTestUser(db: DrizzleDb, userId: string): Promise<void> {
  await db
    .insert(user)
    .values({ id: userId, name: userId, email: `${userId}@test.local` })
    .onConflictDoNothing({ target: user.id });
}

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import * as authSchema from "../../../src/common/db/auth-schema.js";
import { user } from "../../../src/common/db/auth-schema.js";
import * as schema from "../../../src/common/db/schema/index.js";
import type { DrizzleDb } from "../../../src/common/db/db.module.js";

const fullSchema = { ...schema, ...authSchema };

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
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("vyaya_test")
    .start();

  const connectionUri = container.getConnectionUri();
  const pool = new Pool({ connectionString: connectionUri });
  const db = drizzle(pool, { schema: fullSchema });

  await migrate(db, { migrationsFolder: "./drizzle" });

  return {
    db,
    connectionUri,
    teardown: async () => {
      await pool.end();
      await container.stop();
    }
  };
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

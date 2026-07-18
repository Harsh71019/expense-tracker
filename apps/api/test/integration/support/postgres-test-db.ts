import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import * as authSchema from "../../../src/common/db/auth-schema.js";
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

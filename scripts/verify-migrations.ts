import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PostgreSqlContainer } from "@testcontainers/postgresql";

const execFileAsync = promisify(execFile);

/**
 * Confirms `apps/api`'s drizzle migrations apply cleanly (`drizzle-kit migrate`
 * exits 0) against a fresh, empty Postgres database, run via the real CLI
 * path CI/deploy use -- not the programmatic `migrate()` helper
 * `postgres-test-db.ts` uses for test fixtures, which is a different code
 * path and wouldn't catch a migration file that's broken only through the
 * CLI (e.g. a `drizzle-kit`-specific journal/snapshot mismatch).
 */
async function verifyMigrations(): Promise<void> {
  const container = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("treasury_ops_verify_migrations")
    .start();
  try {
    const environment = {
      ...process.env,
      DATABASE_URL: container.getConnectionUri()
    };
    await execFileAsync("pnpm", ["--filter", "@treasury-ops/api", "migrate"], {
      cwd: process.cwd(),
      env: environment
    });
  } finally {
    await container.stop();
  }
}

void verifyMigrations();

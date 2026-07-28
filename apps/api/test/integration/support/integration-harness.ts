import { afterAll, afterEach } from "vitest";

import { assertLedgerInvariants } from "./assert-ledger-invariants.js";
import { activeIntegrationTestDbs, teardownActiveIntegrationTestDbs } from "./postgres-test-db.js";

/**
 * Loaded by vitest.integration.config.ts for every integration file. Any
 * database created through createTestDb is registered automatically, so a
 * new test file cannot silently omit the shared post-test ledger checks.
 */
afterEach(async () => {
  for (const testDb of activeIntegrationTestDbs()) {
    await assertLedgerInvariants(testDb.db);
  }
});

/**
 * Existing suites may still call testDb.teardown() explicitly. Teardown is
 * single-flight, so this safety net handles setup/teardown asymmetry without
 * double-closing pools or containers.
 */
afterAll(async () => {
  await teardownActiveIntegrationTestDbs();
});

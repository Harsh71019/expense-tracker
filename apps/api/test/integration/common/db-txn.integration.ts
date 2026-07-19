import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { withTxn } from "../../../src/common/db/db-txn.js";
import { createTestDb } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("withTxn", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
    await testDb.db.execute(sql`create table transaction_proofs (marker text not null)`);
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("rolls back every write when the operation fails", async () => {
    await expect(
      withTxn(testDb.db, async (tx) => {
        await tx.execute(sql`insert into transaction_proofs (marker) values ('rollback')`);
        throw new Error("Induced transaction failure");
      })
    ).rejects.toThrow("Induced transaction failure");

    const rows = await testDb.db.execute(
      sql`select marker from transaction_proofs where marker = 'rollback'`
    );
    expect(rows.rows).toEqual([]);
  });

  it("returns the operation result after committing its writes", async () => {
    const result = await withTxn(testDb.db, async (tx) => {
      await tx.execute(sql`insert into transaction_proofs (marker) values ('commit')`);
      return "committed";
    });

    expect(result).toBe("committed");
    const rows = await testDb.db.execute(
      sql`select marker from transaction_proofs where marker = 'commit'`
    );
    expect(rows.rows).toHaveLength(1);
  });
});

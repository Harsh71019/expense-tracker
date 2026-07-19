import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { auditLog } from "../../../src/common/db/schema/index.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("AuditRepository", () => {
  let testDb: TestDb;
  let auditRepository: AuditRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    auditRepository = new AuditRepository(testDb.db);
    await insertTestUser(testDb.db, "user-1");
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("records audit logs inside a transaction and commits successfully", async () => {
    await withTxn(testDb.db, async (tx) => {
      await auditRepository.record(
        "user-1",
        "test.action",
        "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        tx
      );
    });

    const logs = await testDb.db.select().from(auditLog).where(eq(auditLog.userId, "user-1"));
    expect(logs.length).toBe(1);
    expect(logs[0]).toMatchObject({
      userId: "user-1",
      action: "test.action",
      entityId: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
    });
    expect(logs[0]?.at).toBeInstanceOf(Date);
  });

  it("rolls back audit log creation if the transaction aborts", async () => {
    await expect(
      withTxn(testDb.db, async (tx) => {
        await auditRepository.record(
          "user-1",
          "abort.action",
          "3fa85f64-5717-4562-b3fc-2c963f66afa7",
          tx
        );
        throw new Error("Force Abort");
      })
    ).rejects.toThrow("Force Abort");

    const logs = await testDb.db.select().from(auditLog).where(eq(auditLog.action, "abort.action"));
    expect(logs.length).toBe(0);
  });
});

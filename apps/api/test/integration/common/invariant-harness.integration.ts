import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { auditLog, transactions } from "../../../src/common/db/schema/index.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("integration invariant harness", () => {
  let testDb: TestDb;
  let transactionId: string;
  let auditId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "invariant-user");
    const accounts = new AccountRepository(testDb.db);
    const transactionRepository = new TransactionRepository(testDb.db);
    const audits = new AuditRepository(testDb.db);

    await withTxn(testDb.db, async (tx) => {
      const account = await accounts.create(
        "invariant-user",
        { name: "Invariant account", type: "cash", openingBalanceMinor: 0 },
        tx
      );
      await accounts.applyBalanceDelta("invariant-user", account.id, -100, tx);
      const transaction = await transactionRepository.create(
        "invariant-user",
        {
          accountId: account.id,
          type: "expense",
          amountMinor: 100,
          occurredAt: new Date("2026-07-28T00:00:00.000Z"),
          description: "Immutable fixture",
          tags: []
        },
        undefined,
        tx
      );
      transactionId = transaction.id;
      await audits.record("invariant-user", "transaction.create", transaction.id, tx);
    });
    const [audit] = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, transactionId));
    if (audit === undefined) throw new Error("Expected invariant audit fixture.");
    auditId = audit.id;
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("rejects monetary mutation, ledger deletion, and audit mutation", async () => {
    await expect(
      testDb.db
        .update(transactions)
        .set({ amountMinor: 101 })
        .where(eq(transactions.id, transactionId))
    ).rejects.toThrow();
    await expect(
      testDb.db.delete(transactions).where(eq(transactions.id, transactionId))
    ).rejects.toThrow();
    await expect(
      testDb.db.update(auditLog).set({ action: "changed" }).where(eq(auditLog.id, auditId))
    ).rejects.toThrow();

    const [transaction] = await testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId));
    expect(transaction?.amountMinor).toBe(100);
    const [audit] = await testDb.db.select().from(auditLog).where(eq(auditLog.id, auditId));
    expect(audit?.action).toBe("transaction.create");
  });
});

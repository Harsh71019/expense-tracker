import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNotNull } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { TransactionNotReversibleError } from "../../../src/common/errors/transaction-not-reversible.error.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  accounts,
  auditLog,
  transactions as transactionsTable
} from "../../../src/common/db/schema/index.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransferService } from "../../../src/transactions/transfer.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const FAKE_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";

describe("TransferService", () => {
  let testDb: TestDb;
  let transfers: TransferService;
  let hdfcAccountId: string;
  let cashAccountId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "someone-else");

    const accountRepository = new AccountRepository(testDb.db);
    transfers = new TransferService(
      testDb.db,
      accountRepository,
      new TransactionRepository(testDb.db),
      new AuditRepository(testDb.db),
      { log: () => undefined, warn: () => undefined }
    );

    const hdfc = await withTxn(testDb.db, (tx) =>
      accountRepository.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 100_000 },
        tx
      )
    );
    hdfcAccountId = hdfc.id;

    const cash = await withTxn(testDb.db, (tx) =>
      accountRepository.create(
        "user-a",
        { name: "Cash", type: "cash", openingBalanceMinor: 5_000 },
        tx
      )
    );
    cashAccountId = cash.id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function accountBalance(name: string): Promise<number> {
    const [account] = await testDb.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, "user-a"), eq(accounts.name, name)));
    if (account === undefined) throw new Error(`Account fixture "${name}" not found`);
    return account.balanceMinor;
  }

  it("moves money atomically between two accounts as linked expense/income legs", async () => {
    const result = await transfers.create(
      "user-a",
      {
        fromAccountId: hdfcAccountId,
        toAccountId: cashAccountId,
        amountMinor: 10_000,
        occurredAt: new Date("2026-07-12T09:00:00.000Z"),
        description: "ATM withdrawal",
        tags: []
      },
      "aaaaaaaa-1111-4111-a111-aaaaaaaaaaaa"
    );

    expect(result.replayed).toBe(false);
    expect(result.fromTransaction.type).toBe("expense");
    expect(result.toTransaction.type).toBe("income");
    expect(result.fromTransaction.transferGroupId).toBe(result.transferGroupId);
    expect(result.toTransaction.transferGroupId).toBe(result.transferGroupId);

    expect(await accountBalance("HDFC Savings")).toBe(90_000);
    expect(await accountBalance("Cash")).toBe(15_000);

    expect(
      (
        await testDb.db
          .select()
          .from(transactionsTable)
          .where(isNotNull(transactionsTable.transferGroupId))
      ).length
    ).toBe(2);
    expect(
      (await testDb.db.select().from(auditLog).where(eq(auditLog.action, "transfer.create"))).length
    ).toBe(2);
  });

  it("replays the same transfer exactly once under concurrent duplicate submissions", async () => {
    const key = "bbbbbbbb-2222-4222-a222-bbbbbbbbbbbb";
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        transfers.create(
          "user-a",
          {
            fromAccountId: hdfcAccountId,
            toAccountId: cashAccountId,
            amountMinor: 2_000,
            occurredAt: new Date("2026-07-13T09:00:00.000Z"),
            description: "Chai fund top-up",
            tags: []
          },
          key
        )
      )
    );

    expect(results.filter((result) => result.replayed).length).toBe(4);
    const groupIds = new Set(results.map((result) => result.transferGroupId));
    expect(groupIds.size).toBe(1);

    expect(
      (
        await testDb.db
          .select()
          .from(transactionsTable)
          .where(eq(transactionsTable.idempotencyKey, key))
      ).length
    ).toBe(1);

    expect(await accountBalance("HDFC Savings")).toBe(88_000);
  });

  it("rolls back both balance changes when the destination account does not exist", async () => {
    await expect(
      transfers.create(
        "user-a",
        {
          fromAccountId: hdfcAccountId,
          toAccountId: FAKE_ID,
          amountMinor: 500,
          occurredAt: new Date("2026-07-14T09:00:00.000Z"),
          description: "Bad transfer",
          tags: []
        },
        "cccccccc-3333-4333-a333-cccccccccccc"
      )
    ).rejects.toThrow("Account not found.");

    expect(await accountBalance("HDFC Savings")).toBe(88_000);
    expect(
      (
        await testDb.db
          .select()
          .from(transactionsTable)
          .where(eq(transactionsTable.idempotencyKey, "cccccccc-3333-4333-a333-cccccccccccc"))
      ).length
    ).toBe(0);
  });

  it("reverses both legs atomically, restoring original balances", async () => {
    const original = await transfers.create(
      "user-a",
      {
        fromAccountId: hdfcAccountId,
        toAccountId: cashAccountId,
        amountMinor: 1_000,
        occurredAt: new Date("2026-07-15T09:00:00.000Z"),
        description: "Coffee fund",
        tags: []
      },
      "dddddddd-4444-4444-a444-dddddddddddd"
    );

    const before = {
      hdfc: await accountBalance("HDFC Savings"),
      cash: await accountBalance("Cash")
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => transfers.reverse("user-a", original.transferGroupId))
    );

    expect(results.filter((result) => result.replayed).length).toBe(4);
    const groupIds = new Set(results.map((result) => result.transferGroupId));
    expect(groupIds.size).toBe(1);
    expect(groupIds.has(original.transferGroupId)).toBe(false);

    expect(await accountBalance("HDFC Savings")).toBe(before.hdfc + 1_000);
    expect(await accountBalance("Cash")).toBe(before.cash - 1_000);

    expect(
      (
        await testDb.db
          .select()
          .from(transactionsTable)
          .where(eq(transactionsTable.transferGroupId, reversalGroupId(results)))
      ).length
    ).toBe(2);
  });

  it("cannot reverse a transfer that belongs to another user", async () => {
    const original = await transfers.create(
      "user-a",
      {
        fromAccountId: hdfcAccountId,
        toAccountId: cashAccountId,
        amountMinor: 400,
        occurredAt: new Date("2026-07-16T09:00:00.000Z"),
        description: "Snacks",
        tags: []
      },
      "eeeeeeee-5555-4555-a555-eeeeeeeeeeee"
    );

    await expect(transfers.reverse("someone-else", original.transferGroupId)).rejects.toThrow(
      EntityNotFoundError
    );
  });

  it("throws TransactionNotReversibleError when reversing an already-reversed transfer group", async () => {
    const original = await transfers.create(
      "user-a",
      {
        fromAccountId: hdfcAccountId,
        toAccountId: cashAccountId,
        amountMinor: 200,
        occurredAt: new Date("2026-07-16T10:00:00.000Z"),
        description: "Vending machine",
        tags: []
      },
      "ffffffff-6666-4666-a666-ffffffffffff"
    );
    const reversed = await transfers.reverse("user-a", original.transferGroupId);

    await expect(transfers.reverse("user-a", reversed.transferGroupId)).rejects.toThrow(
      TransactionNotReversibleError
    );
  });
});

function reversalGroupId(results: ReadonlyArray<{ transferGroupId: string }>): string {
  const first = results[0];
  if (first === undefined) throw new Error("Expected at least one reversal result");
  return first.transferGroupId;
}

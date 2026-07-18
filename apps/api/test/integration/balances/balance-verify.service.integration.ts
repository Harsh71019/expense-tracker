import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";
import { eq } from "drizzle-orm";
import type { CreateTransaction, Transaction } from "@vyaya/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { BalanceVerifyRepository } from "../../../src/balances/balance-verify.repository.js";
import { BalanceVerifyService } from "../../../src/balances/balance-verify.service.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import type { DbTx } from "../../../src/common/db/db-txn.js";
import { accounts as accountsTable } from "../../../src/common/db/schema/index.js";
import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, error: () => undefined };

describe("BalanceVerifyService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let pgTestDb: TestDb | undefined;
  let accounts: AccountRepository | undefined;
  let outbox: NotificationOutboxRepository | undefined;
  let driftedAccountId: string | undefined;
  let cleanAccountId: string | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    // accounts/transactions/balance-verify are Postgres-backed (this task);
    // notification_outbox is still Mongo (Task 20 not done yet) -- two databases.
    pgTestDb = await createTestDb();
    await insertTestUser(pgTestDb.db, "user-a");
    await insertTestUser(pgTestDb.db, "user-b");

    process.env.MONGODB_URI = replicaSet.getUri("vyaya_balance_verify_test");
    process.env.DATABASE_URL = pgTestDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/14";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    connection = await createConnection(replicaSet.getUri("vyaya_balance_verify_test")).asPromise();
    accounts = new AccountRepository(pgTestDb.db);
    const transactions = new TransactionRepository(pgTestDb.db);
    outbox = new NotificationOutboxRepository(connection);

    /**
     * Mirrors TransactionService.create's core (insert + balance $inc in one
     * transaction) — using TransactionRepository.create alone, as other
     * integration tests in this repo do when they only care about the
     * transaction rows themselves, would leave balanceMinor never
     * incremented at all, which is exactly the invariant this cron checks.
     */
    async function postTransaction(userId: string, input: CreateTransaction): Promise<Transaction> {
      return withTxn(requirePgTestDb(pgTestDb).db, async (tx: DbTx) => {
        const deltaMinor = input.type === "income" ? input.amountMinor : -input.amountMinor;
        await requireAccounts(accounts).applyBalanceDelta(userId, input.accountId, deltaMinor, tx);
        return transactions.create(userId, input, undefined, tx);
      });
    }

    // Account A: opening 10,000, one 2,000 expense -> correctly cached at 8,000.
    const drifted = await withTxn(requirePgTestDb(pgTestDb).db, (tx) =>
      requireAccounts(accounts).create(
        "user-a",
        { name: "Drifted Account", type: "bank", openingBalanceMinor: 10_000 },
        tx
      )
    );
    driftedAccountId = drifted.id;
    await postTransaction("user-a", {
      accountId: drifted.id,
      type: "expense",
      amountMinor: 2_000,
      occurredAt: new Date("2026-07-10T09:00:00.000Z"),
      description: "Groceries",
      tags: []
    });
    // Simulate the exact bug class this cron exists to catch: the cache
    // silently disagreeing with the ledger it's supposed to mirror.
    await requirePgTestDb(pgTestDb)
      .db.update(accountsTable)
      .set({ balanceMinor: 7_000 })
      .where(eq(accountsTable.id, drifted.id));

    // Account B: opening 5,000, no transactions, then archived -> still consistent, must not false-positive.
    const clean = await withTxn(requirePgTestDb(pgTestDb).db, (tx) =>
      requireAccounts(accounts).create(
        "user-a",
        { name: "Clean Account", type: "cash", openingBalanceMinor: 5_000 },
        tx
      )
    );
    cleanAccountId = clean.id;
    await requireAccounts(accounts).archive("user-a", clean.id);

    // Account C: a different user, consistent, must not be affected by user-a's drift.
    const other = await withTxn(requirePgTestDb(pgTestDb).db, (tx) =>
      requireAccounts(accounts).create(
        "user-b",
        { name: "Other User Account", type: "wallet", openingBalanceMinor: 0 },
        tx
      )
    );
    await postTransaction("user-b", {
      accountId: other.id,
      type: "income",
      amountMinor: 1_000,
      occurredAt: new Date("2026-07-10T09:00:00.000Z"),
      description: "Refund",
      tags: []
    });
  }, 60_000);

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
    if (pgTestDb !== undefined) await pgTestDb.teardown();
  });

  function newVerifier(serviceRole: "api" | "worker"): BalanceVerifyService {
    process.env.SERVICE_ROLE = serviceRole;
    return new BalanceVerifyService(
      connectedConnection(connection),
      new RuntimeConfigService(),
      new BalanceVerifyRepository(requirePgTestDb(pgTestDb).db),
      requireOutbox(outbox),
      NOOP_LOGGER
    );
  }

  it("is a no-op when SERVICE_ROLE is not worker", async () => {
    await newVerifier("api").verify();
    const count = await connectedDatabase(connection)
      .collection("notification_outbox")
      .countDocuments();
    expect(count).toBe(0);
  });

  it("flags exactly the drifted account, leaves clean and other-user accounts alone", async () => {
    await newVerifier("worker").verify();

    const entries = await connectedDatabase(connection)
      .collection("notification_outbox")
      .find({ type: "balance_drift" })
      .toArray();
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry?.userId).toBe("user-a");
    expect(entry?.payload).toMatchObject({
      accountId: requireId(driftedAccountId),
      expectedBalanceMinor: 8_000,
      actualBalanceMinor: 7_000,
      driftMinor: -1_000
    });

    const cleanEntry = await connectedDatabase(connection)
      .collection("notification_outbox")
      .findOne({ "payload.accountId": requireId(cleanAccountId) });
    expect(cleanEntry).toBeNull();
  });

  it("re-running verify re-flags an unresolved drift rather than muting after the first alert", async () => {
    await newVerifier("worker").verify();
    const count = await connectedDatabase(connection)
      .collection("notification_outbox")
      .countDocuments({ type: "balance_drift" });
    // The drift is still present (nothing corrects it automatically), so a
    // second sweep re-flags it — this cron has no "already notified" memory,
    // matching BACKEND.md's framing as a repeated self-audit, not a one-shot.
    expect(count).toBe(2);
  });
});

function requireAccounts(repository: AccountRepository | undefined): AccountRepository {
  if (repository === undefined) throw new Error("Account repository is not ready");
  return repository;
}

function requireOutbox(
  repository: NotificationOutboxRepository | undefined
): NotificationOutboxRepository {
  if (repository === undefined) throw new Error("Notification outbox repository is not ready");
  return repository;
}

function requireId(id: string | undefined): string {
  if (id === undefined) throw new Error("Fixture id is not ready");
  return id;
}

function requirePgTestDb(testDb: TestDb | undefined): TestDb {
  if (testDb === undefined) throw new Error("Postgres test db is not ready");
  return testDb;
}

function connectedConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) throw new Error("MongoDB connection is not ready");
  return connection;
}

function connectedDatabase(connection: Connection | undefined): NonNullable<Connection["db"]> {
  const database = connectedConnection(connection).db;
  if (database === undefined) throw new Error("MongoDB database is not ready");
  return database;
}

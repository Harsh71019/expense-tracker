import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { CreateTransaction, Transaction } from "@vyaya/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { BalanceVerifyRepository } from "../../../src/balances/balance-verify.repository.js";
import { BalanceVerifyService } from "../../../src/balances/balance-verify.service.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import type { DbTx } from "../../../src/common/db/db-txn.js";
import {
  accounts as accountsTable,
  notificationOutbox
} from "../../../src/common/db/schema/index.js";
import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, error: () => undefined };

describe("BalanceVerifyService", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let transactionsRepo: TransactionRepository;
  let outbox: NotificationOutboxRepository;
  let driftedAccountId: string;
  let cleanAccountId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-b");

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/14";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    accounts = new AccountRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);
    transactionsRepo = transactions;
    outbox = new NotificationOutboxRepository(testDb.db);

    /**
     * Mirrors TransactionService.create's core (insert + balance $inc in one
     * transaction) — using TransactionRepository.create alone, as other
     * integration tests in this repo do when they only care about the
     * transaction rows themselves, would leave balanceMinor never
     * incremented at all, which is exactly the invariant this cron checks.
     */
    async function postTransaction(userId: string, input: CreateTransaction): Promise<Transaction> {
      return withTxn(testDb.db, async (tx: DbTx) => {
        const deltaMinor = input.type === "income" ? input.amountMinor : -input.amountMinor;
        await accounts.applyBalanceDelta(userId, input.accountId, deltaMinor, tx);
        return transactions.create(userId, input, undefined, tx);
      });
    }

    // Account A: opening 10,000, one 2,000 expense -> correctly cached at 8,000.
    const drifted = await withTxn(testDb.db, (tx) =>
      accounts.create(
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
    await testDb.db
      .update(accountsTable)
      .set({ balanceMinor: 7_000 })
      .where(eq(accountsTable.id, drifted.id));

    // Account B: opening 5,000, no transactions, then archived -> still consistent, must not false-positive.
    const clean = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-a",
        { name: "Clean Account", type: "cash", openingBalanceMinor: 5_000 },
        tx
      )
    );
    cleanAccountId = clean.id;
    await accounts.archive("user-a", clean.id);

    // Account C: a different user, consistent, must not be affected by user-a's drift.
    const other = await withTxn(testDb.db, (tx) =>
      accounts.create(
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
    await testDb.teardown();
  });

  function newVerifier(serviceRole: "api" | "worker"): BalanceVerifyService {
    process.env.SERVICE_ROLE = serviceRole;
    return new BalanceVerifyService(
      testDb.db,
      new RuntimeConfigService(),
      new BalanceVerifyRepository(testDb.db),
      outbox,
      NOOP_LOGGER
    );
  }

  it("is a no-op when SERVICE_ROLE is not worker", async () => {
    await newVerifier("api").verify();
    const rows = await testDb.db.select().from(notificationOutbox);
    expect(rows).toHaveLength(0);
  });

  it("flags exactly the drifted account, leaves clean and other-user accounts alone", async () => {
    await newVerifier("worker").verify();

    const entries = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.type, "balance_drift"));
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry?.userId).toBe("user-a");
    expect(entry?.payload).toMatchObject({
      accountId: driftedAccountId,
      expectedBalanceMinor: 8_000,
      actualBalanceMinor: 7_000,
      driftMinor: -1_000
    });

    // entries already has length 1 (the drifted account only) -- the clean
    // account never made it into the outbox at all.
    expect(entries.every((row) => payloadAccountId(row.payload) !== cleanAccountId)).toBe(true);
  });

  it("re-running verify re-flags an unresolved drift rather than muting after the first alert", async () => {
    await newVerifier("worker").verify();
    const entries = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.type, "balance_drift"));
    // The drift is still present (nothing corrects it automatically), so a
    // second sweep re-flags it — this cron has no "already notified" memory,
    // matching BACKEND.md's framing as a repeated self-audit, not a one-shot.
    expect(entries).toHaveLength(2);
  });

  it("sumDeltasByAccount sums past the int4 ceiling without truncating or wrapping", async () => {
    // Each individual amountMinor stays well under int4's ~2.1B ceiling, but the
    // two together push the SUM aggregate past it -- a ::int cast here would wrap
    // this to a negative number instead of erroring, which is exactly why it's
    // silent in production without a test like this one.
    const account = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-a",
        { name: "High Balance Account", type: "bank", openingBalanceMinor: 0 },
        tx
      )
    );
    await withTxn(testDb.db, (tx) =>
      transactionsRepo.create(
        "user-a",
        {
          accountId: account.id,
          type: "income",
          amountMinor: 1_200_000_000,
          occurredAt: new Date("2026-07-11T09:00:00.000Z"),
          description: "Large income 1",
          tags: []
        },
        undefined,
        tx
      )
    );
    await withTxn(testDb.db, (tx) =>
      transactionsRepo.create(
        "user-a",
        {
          accountId: account.id,
          type: "income",
          amountMinor: 1_200_000_000,
          occurredAt: new Date("2026-07-12T09:00:00.000Z"),
          description: "Large income 2",
          tags: []
        },
        undefined,
        tx
      )
    );

    const deltas = await new BalanceVerifyRepository(testDb.db).sumDeltasByAccount();
    expect(deltas.get(account.id)).toBe(2_400_000_000);
  });
});

function payloadAccountId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("accountId" in payload))
    return undefined;
  const { accountId } = payload;
  return typeof accountId === "string" ? accountId : undefined;
}

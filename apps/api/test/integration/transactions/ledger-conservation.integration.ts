import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { BalanceVerifyRepository } from "../../../src/balances/balance-verify.repository.js";
import { BalanceVerifyService } from "../../../src/balances/balance-verify.service.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  accounts as accountsTable,
  notificationOutbox
} from "../../../src/common/db/schema/index.js";
import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, warn: () => undefined, error: () => undefined };
const USER_ID = "ledger-user";
const OPENING_BALANCE_MINOR = 10_000_000; // ₹1,00,000

/**
 * Deterministic PRNG (not Math.random) so a failing seed can be reported
 * and replayed exactly -- a random-per-run seed would make a rare
 * conservation bug unreproducible the moment CI reruns the suite.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Ledger conservation", () => {
  let testDb: TestDb;
  let accountRepository: AccountRepository;
  let transactionService: TransactionService;
  let balanceVerifyRepository: BalanceVerifyRepository;
  const accountIds: string[] = [];

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, USER_ID);

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/14";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    accountRepository = new AccountRepository(testDb.db);
    balanceVerifyRepository = new BalanceVerifyRepository(testDb.db);
    transactionService = new TransactionService(
      testDb.db,
      accountRepository,
      new CategoryRepository(testDb.db),
      new TransactionRepository(testDb.db),
      new AuditRepository(testDb.db),
      NOOP_LOGGER
    );
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function openAccount(name: string): Promise<string> {
    const account = await withTxn(testDb.db, (tx) =>
      accountRepository.create(
        USER_ID,
        { name, type: "bank", openingBalanceMinor: OPENING_BALANCE_MINOR },
        tx
      )
    );
    accountIds.push(account.id);
    return account.id;
  }

  async function cachedBalance(accountId: string): Promise<number> {
    const [row] = await testDb.db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId));
    if (row === undefined) throw new Error(`Account ${accountId} not found`);
    return row.balanceMinor;
  }

  /**
   * Runs a random walk of incomes/expenses/reversals against a fresh
   * account seeded at OPENING_BALANCE_MINOR, then appends one closing
   * entry that brings the running net back to exactly zero -- mirroring
   * the manual "start at 1,00,000, transact your way back to zero net
   * effect" check, but swept across many deterministic sequences instead
   * of one hand-picked one.
   */
  async function runConservationWalk(seed: number, stepCount: number): Promise<string> {
    const rand = mulberry32(seed);
    const accountId = await openAccount(`Seed ${seed} account`);

    const reversible: Array<{ id: string; deltaMinor: number }> = [];
    let netMinor = 0;

    for (let i = 0; i < stepCount; i += 1) {
      const shouldReverse = reversible.length > 0 && rand() < 0.2;
      if (shouldReverse) {
        const index = Math.floor(rand() * reversible.length);
        const [target] = reversible.splice(index, 1);
        if (target === undefined) throw new Error("unreachable: reversible list was non-empty");
        await transactionService.reverse(USER_ID, target.id);
        netMinor += -target.deltaMinor;
        continue;
      }

      const type = rand() < 0.5 ? "income" : "expense";
      const amountMinor = 100 + Math.floor(rand() * 500_000);
      const { transaction } = await transactionService.create(
        USER_ID,
        {
          accountId,
          type,
          amountMinor,
          occurredAt: new Date(2026, 6, 1, 0, i),
          description: `seed ${seed} step ${i}`,
          tags: []
        },
        undefined
      );
      const deltaMinor = type === "income" ? amountMinor : -amountMinor;
      netMinor += deltaMinor;
      reversible.push({ id: transaction.id, deltaMinor });
    }

    if (netMinor !== 0) {
      const closingType = netMinor > 0 ? "expense" : "income";
      const closingAmountMinor = Math.abs(netMinor);
      await transactionService.create(
        USER_ID,
        {
          accountId,
          type: closingType,
          amountMinor: closingAmountMinor,
          occurredAt: new Date(2026, 6, 1, 0, stepCount),
          description: `seed ${seed} closing entry`,
          tags: []
        },
        undefined
      );
      netMinor += closingType === "income" ? closingAmountMinor : -closingAmountMinor;
    }

    expect(netMinor).toBe(0);
    return accountId;
  }

  const seeds = [1, 2, 3, 4, 5];
  for (const seed of seeds) {
    it(`seed ${seed}: a closed loop of transactions and reversals returns the account to its opening balance`, async () => {
      const accountId = await runConservationWalk(seed, 24);

      expect(await cachedBalance(accountId)).toBe(OPENING_BALANCE_MINOR);

      // Cross-check the cache against an independent re-derivation from the
      // ledger itself, not just the running total this test happened to
      // compute -- this is the same reconstruction BalanceVerifyService
      // uses in production, applied on demand instead of waiting for Sunday.
      const deltasByAccount = await balanceVerifyRepository.sumDeltasByAccount();
      const netDeltaMinor = deltasByAccount.get(accountId) ?? 0;
      expect(OPENING_BALANCE_MINOR + netDeltaMinor).toBe(await cachedBalance(accountId));
    });
  }

  it("a hand-picked sequence with income, expenses, and a reversal nets back to the opening balance", async () => {
    const accountId = await openAccount("Manual walk-through account");

    const { transaction: salary } = await transactionService.create(
      USER_ID,
      {
        accountId,
        type: "income",
        amountMinor: 5_000_000,
        occurredAt: new Date("2026-07-01T09:00:00.000Z"),
        description: "Salary",
        tags: []
      },
      undefined
    );
    await transactionService.create(
      USER_ID,
      {
        accountId,
        type: "expense",
        amountMinor: 1_200_000,
        occurredAt: new Date("2026-07-05T09:00:00.000Z"),
        description: "Rent",
        tags: []
      },
      undefined
    );
    // A miskeyed expense, caught and reversed rather than edited or deleted --
    // the ledger is append-only, so this must show up as an opposite-signed
    // row, not vanish.
    const { transaction: mistake } = await transactionService.create(
      USER_ID,
      {
        accountId,
        type: "expense",
        amountMinor: 900_000,
        occurredAt: new Date("2026-07-08T09:00:00.000Z"),
        description: "Mistaken double charge",
        tags: []
      },
      undefined
    );
    await transactionService.reverse(USER_ID, mistake.id);
    // Bring the net back to exactly zero: +5,000,000 -1,200,000 -900,000
    // (mistake) +900,000 (reversal cancels the mistake) leaves +3,800,000
    // outstanding.
    await transactionService.create(
      USER_ID,
      {
        accountId,
        type: "expense",
        amountMinor: 3_800_000,
        occurredAt: new Date("2026-07-20T09:00:00.000Z"),
        description: "Closing entry",
        tags: []
      },
      undefined
    );

    expect(await cachedBalance(accountId)).toBe(OPENING_BALANCE_MINOR);
    expect(salary.type).toBe("income");
  });

  it("concurrent transactions against one account never lose an update", async () => {
    const accountId = await openAccount("Concurrency account");
    const amounts = Array.from({ length: 15 }, (_unused, i) => 1_000 + i * 137);

    await Promise.all(
      amounts.map((amountMinor, i) =>
        transactionService.create(
          USER_ID,
          {
            accountId,
            type: "income",
            amountMinor,
            occurredAt: new Date(2026, 6, 10, 0, i),
            description: `concurrent income ${i}`,
            tags: []
          },
          undefined
        )
      )
    );

    const expectedBalance =
      OPENING_BALANCE_MINOR + amounts.reduce((sum, amount) => sum + amount, 0);
    expect(await cachedBalance(accountId)).toBe(expectedBalance);

    // Bring it back to the opening balance so this account doesn't skew the
    // whole-suite drift sweep below.
    await transactionService.create(
      USER_ID,
      {
        accountId,
        type: "expense",
        amountMinor: expectedBalance - OPENING_BALANCE_MINOR,
        occurredAt: new Date("2026-07-25T09:00:00.000Z"),
        description: "Closing entry",
        tags: []
      },
      undefined
    );
    expect(await cachedBalance(accountId)).toBe(OPENING_BALANCE_MINOR);
  });

  it("the app's own weekly self-audit finds zero drift across every account this suite touched", async () => {
    process.env.SERVICE_ROLE = "worker";
    const verifier = new BalanceVerifyService(
      testDb.db,
      new RuntimeConfigService(),
      balanceVerifyRepository,
      new NotificationOutboxRepository(testDb.db),
      NOOP_LOGGER
    );

    await verifier.verify();

    const drifts = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.type, "balance_drift"));
    const driftsForThisSuite = drifts.filter((row) =>
      accountIds.includes(payloadAccountId(row.payload))
    );
    expect(driftsForThisSuite).toHaveLength(0);
  });
});

function payloadAccountId(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || !("accountId" in payload)) return "";
  const { accountId } = payload;
  return typeof accountId === "string" ? accountId : "";
}

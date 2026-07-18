import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { toISTMonth } from "../../../src/common/time/ist.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { MonthlyRollupRepository } from "../../../src/reports/monthly-rollup.repository.js";
import { previousMonth } from "../../../src/reports/month.js";
import { RollupsRefreshService } from "../../../src/reports/rollups-refresh.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, error: () => undefined };

describe("RollupsRefreshService", () => {
  let testDb: TestDb;
  let rollups: MonthlyRollupRepository;
  let accountId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.MONGODB_URI = "mongodb://localhost:27017/unused-rollups-refresh-test";
    process.env.REDIS_URL = "redis://127.0.0.1:6379/11";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    const accounts = new AccountRepository(testDb.db);
    const transactions = new TransactionRepository(testDb.db);
    rollups = new MonthlyRollupRepository(testDb.db);

    const account = await withTxn(testDb.db, (tx) =>
      accounts.create("user-a", { name: "Cash", type: "cash", openingBalanceMinor: 0 }, tx)
    );
    accountId = account.id;

    const now = new Date();

    await withTxn(testDb.db, (tx) =>
      transactions.create(
        "user-a",
        {
          accountId,
          type: "expense",
          amountMinor: 1_000,
          occurredAt: now,
          description: "This month",
          tags: []
        },
        undefined,
        tx
      )
    );
    await withTxn(testDb.db, (tx) =>
      transactions.create(
        "user-a",
        {
          accountId,
          type: "expense",
          amountMinor: 500,
          occurredAt: monthAgo(now),
          description: "Last month",
          tags: []
        },
        undefined,
        tx
      )
    );
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function newRefresher(serviceRole: "api" | "worker"): RollupsRefreshService {
    process.env.SERVICE_ROLE = serviceRole;
    return new RollupsRefreshService(new RuntimeConfigService(), rollups, NOOP_LOGGER);
  }

  it("is a no-op when SERVICE_ROLE is not worker", async () => {
    await newRefresher("api").refresh();
    const currentMonth = toISTMonth(new Date());
    const found = await rollups.findByMonth("user-a", currentMonth);
    expect(found).toBeNull();
  });

  it("recomputes both the current and previous month for every user with transactions", async () => {
    await newRefresher("worker").refresh();

    const currentMonth = toISTMonth(new Date());
    const lastMonth = previousMonth(currentMonth);

    const current = await rollups.findByMonth("user-a", currentMonth);
    expect(current?.totalExpenseMinor).toBe(1_000);

    const previous = await rollups.findByMonth("user-a", lastMonth);
    expect(previous?.totalExpenseMinor).toBe(500);
  });
});

function monthAgo(date: Date): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() - 1);
  return result;
}

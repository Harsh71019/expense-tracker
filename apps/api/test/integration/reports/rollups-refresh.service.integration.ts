import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { toISTMonth } from "../../../src/common/time/ist.js";
import { withTxn } from "../../../src/common/mongo-txn.js";
import { MonthlyRollupRepository } from "../../../src/reports/monthly-rollup.repository.js";
import { previousMonth } from "../../../src/reports/month.js";
import { RollupsRefreshService } from "../../../src/reports/rollups-refresh.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";

const NOOP_LOGGER = { log: () => undefined, error: () => undefined };

describe("RollupsRefreshService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let rollups: MonthlyRollupRepository | undefined;
  let accountId: string | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replicaSet.getUri("vyaya_rollups_refresh_test");
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    process.env.REDIS_URL = "redis://127.0.0.1:6379/9";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    connection = await createConnection(
      replicaSet.getUri("vyaya_rollups_refresh_test")
    ).asPromise();
    const accounts = new AccountRepository(connection);
    const transactions = new TransactionRepository(connection);
    rollups = new MonthlyRollupRepository(connection);

    const account = await withTxn(connectedConnection(connection), (session) =>
      accounts.create("user-a", { name: "Cash", type: "cash", openingBalanceMinor: 0 }, session)
    );
    accountId = account.id;

    const now = new Date();

    await withTxn(connectedConnection(connection), (session) =>
      transactions.create(
        "user-a",
        {
          accountId: requireId(accountId),
          type: "expense",
          amountMinor: 1_000,
          occurredAt: now,
          description: "This month",
          tags: []
        },
        undefined,
        session
      )
    );
    await withTxn(connectedConnection(connection), (session) =>
      transactions.create(
        "user-a",
        {
          accountId: requireId(accountId),
          type: "expense",
          amountMinor: 500,
          occurredAt: monthAgo(now),
          description: "Last month",
          tags: []
        },
        undefined,
        session
      )
    );
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  function newRefresher(serviceRole: "api" | "worker"): RollupsRefreshService {
    process.env.SERVICE_ROLE = serviceRole;
    return new RollupsRefreshService(
      new RuntimeConfigService(),
      monthlyRollupRepository(rollups),
      NOOP_LOGGER
    );
  }

  it("is a no-op when SERVICE_ROLE is not worker", async () => {
    await newRefresher("api").refresh();
    const currentMonth = toISTMonth(new Date());
    const found = await monthlyRollupRepository(rollups).findByMonth("user-a", currentMonth);
    expect(found).toBeNull();
  });

  it("recomputes both the current and previous month for every user with transactions", async () => {
    await newRefresher("worker").refresh();

    const currentMonth = toISTMonth(new Date());
    const lastMonth = previousMonth(currentMonth);

    const current = await monthlyRollupRepository(rollups).findByMonth("user-a", currentMonth);
    expect(current?.totalExpenseMinor).toBe(1_000);

    const previous = await monthlyRollupRepository(rollups).findByMonth("user-a", lastMonth);
    expect(previous?.totalExpenseMinor).toBe(500);
  });
});

function monthAgo(date: Date): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() - 1);
  return result;
}

function monthlyRollupRepository(
  repository: MonthlyRollupRepository | undefined
): MonthlyRollupRepository {
  if (repository === undefined) throw new Error("Monthly rollup repository is not ready");
  return repository;
}

function requireId(id: string | undefined): string {
  if (id === undefined) throw new Error("Fixture id is not ready");
  return id;
}

function connectedConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) throw new Error("MongoDB connection is not ready");
  return connection;
}

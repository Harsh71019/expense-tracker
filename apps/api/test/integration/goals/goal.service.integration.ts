import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  auditLog,
  goals as goalsTable,
  notificationOutbox
} from "../../../src/common/db/schema/index.js";
import { IdempotencyPostgresRepository } from "../../../src/common/idempotency/idempotency-postgres.repository.js";
import { IdempotencyPostgresService } from "../../../src/common/idempotency/idempotency-postgres.service.js";
import { GoalMutationService } from "../../../src/goals/goal-mutation.service.js";
import { GoalRepository } from "../../../src/goals/goal.repository.js";
import { GoalService } from "../../../src/goals/goal.service.js";
import { GoalsProgressCron } from "../../../src/goals/goals-progress.cron.js";
import { NotificationOutboxRepository } from "../../../src/notifications/notification-outbox.repository.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { TransactionService } from "../../../src/transactions/transaction.service.js";
import { TransferService } from "../../../src/transactions/transfer.service.js";
import { assertLedgerInvariants } from "../support/assert-ledger-invariants.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

describe("GoalService", () => {
  let testDb: TestDb;
  let accounts: AccountRepository;
  let goals: GoalRepository;
  let service: GoalService;
  let mutations: GoalMutationService;
  let transactions: TransactionService;
  let transfers: TransferService;
  let outbox: NotificationOutboxRepository;

  beforeAll(async () => {
    testDb = await createTestDb();
    for (const userId of [
      "goal-linked",
      "goal-tagged",
      "goal-unique",
      "goal-reorder",
      "goal-idempotent",
      "goal-cron",
      "goal-manual"
    ]) {
      await insertTestUser(testDb.db, userId);
    }

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/12";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    accounts = new AccountRepository(testDb.db);
    goals = new GoalRepository(testDb.db);
    const audit = new AuditRepository(testDb.db);
    service = new GoalService(testDb.db, goals, accounts, audit);
    mutations = new GoalMutationService(
      service,
      new IdempotencyPostgresService(testDb.db, new IdempotencyPostgresRepository(testDb.db))
    );
    const transactionRepository = new TransactionRepository(testDb.db);
    transactions = new TransactionService(
      testDb.db,
      accounts,
      new CategoryRepository(testDb.db),
      transactionRepository,
      audit,
      NOOP_LOGGER
    );
    transfers = new TransferService(testDb.db, accounts, transactionRepository, audit, NOOP_LOGGER);
    outbox = new NotificationOutboxRepository(testDb.db);
  }, 60_000);

  afterEach(async () => {
    await assertLedgerInvariants(testDb.db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("captures a linked account baseline so its existing balance is not goal progress", async () => {
    const accountId = await createAccount("goal-linked", "Emergency Savings", 500_000);
    const goal = await service.create("goal-linked", {
      name: "Emergency Fund",
      targetMinor: 1_000_000,
      fundingMode: "linked_account",
      linkedAccountId: accountId
    });

    expect(goal.startedMinor).toBe(500_000);
    expect(goal.progressMinor).toBe(0);

    await transactions.create(
      "goal-linked",
      {
        accountId,
        type: "income",
        amountMinor: 125_000,
        occurredAt: new Date(),
        description: "Monthly goal contribution",
        tags: []
      },
      undefined
    );

    await expect(service.get("goal-linked", goal.id)).resolves.toMatchObject({
      progressMinor: 125_000
    });
  });

  it("computes tagged progress from signed posted transactions and a transfer's symmetric legs", async () => {
    const fromAccountId = await createAccount("goal-tagged", "Salary Account", 100_000);
    const toAccountId = await createAccount("goal-tagged", "Savings Account", 0);
    const goal = await service.create("goal-tagged", {
      name: "Laptop",
      targetMinor: 500_000,
      fundingMode: "tagged",
      tag: "goal:laptop"
    });

    await transactions.create(
      "goal-tagged",
      {
        accountId: fromAccountId,
        type: "income",
        amountMinor: 50_000,
        occurredAt: new Date(),
        description: "Laptop contribution",
        tags: ["goal:laptop"]
      },
      undefined
    );
    await transactions.create(
      "goal-tagged",
      {
        accountId: fromAccountId,
        type: "expense",
        amountMinor: 10_000,
        occurredAt: new Date(),
        description: "Contribution correction",
        tags: ["goal:laptop"]
      },
      undefined
    );
    await transactions.create(
      "goal-tagged",
      {
        accountId: fromAccountId,
        type: "income",
        amountMinor: 99_000,
        occurredAt: new Date(),
        description: "Unrelated income",
        tags: ["other"]
      },
      undefined
    );
    await transfers.create(
      "goal-tagged",
      {
        fromAccountId,
        toAccountId,
        amountMinor: 20_000,
        occurredAt: new Date(),
        description: "Move saved money",
        tags: ["goal:laptop"]
      },
      undefined
    );

    await expect(service.get("goal-tagged", goal.id)).resolves.toMatchObject({
      progressMinor: 40_000
    });
  });

  it("enforces unique goal tags and one active goal per linked account", async () => {
    const accountId = await createAccount("goal-unique", "Dedicated Savings", 0);
    const linked = await service.create("goal-unique", {
      name: "First linked goal",
      targetMinor: 100_000,
      fundingMode: "linked_account",
      linkedAccountId: accountId
    });
    await expect(
      service.create("goal-unique", {
        name: "Second linked goal",
        targetMinor: 100_000,
        fundingMode: "linked_account",
        linkedAccountId: accountId
      })
    ).rejects.toThrow("already assigned");

    await service.abandon("goal-unique", linked.id);
    await expect(
      service.create("goal-unique", {
        name: "Replacement linked goal",
        targetMinor: 100_000,
        fundingMode: "linked_account",
        linkedAccountId: accountId
      })
    ).resolves.toMatchObject({ progressMinor: 0 });

    await service.create("goal-unique", {
      name: "Tagged goal",
      targetMinor: 100_000,
      fundingMode: "tagged",
      tag: "goal:unique"
    });
    await expect(
      service.create("goal-unique", {
        name: "Duplicate tag",
        targetMinor: 100_000,
        fundingMode: "tagged",
        tag: "goal:unique"
      })
    ).rejects.toThrow("already assigned");
  });

  it("reassigns active priorities from a complete desired order", async () => {
    const created = await Promise.all(
      ["one", "two", "three"].map((tag) =>
        service.create("goal-reorder", {
          name: tag,
          targetMinor: 100_000,
          fundingMode: "tagged",
          tag: `goal:${tag}`
        })
      )
    );
    const [first, second, third] = created;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("Expected three goal fixtures.");
    }

    await service.reorder("goal-reorder", {
      goalIds: [third.id, first.id, second.id]
    });
    const reordered = await service.list("goal-reorder", "active");
    expect(reordered.map((goal) => goal.id)).toEqual([third.id, first.id, second.id]);
    expect(reordered.map((goal) => goal.priority)).toEqual([0, 1, 2]);

    await expect(
      service.reorder("goal-reorder", { goalIds: [third.id, first.id] })
    ).rejects.toThrow("every active goal");
  });

  it("replays five concurrent identical creates and abandons with exactly one effect", async () => {
    const createKey = "11111111-aaaa-4111-8111-111111111111";
    const creates = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.create(
          "goal-idempotent",
          {
            name: "Replay-safe goal",
            targetMinor: 100_000,
            fundingMode: "tagged",
            tag: "goal:replay"
          },
          createKey
        )
      )
    );
    expect(creates.filter((result) => !result.replayed)).toHaveLength(1);
    const goalId = creates[0]?.result.id;
    if (goalId === undefined) throw new Error("Expected a created goal.");

    const abandons = await Promise.all(
      Array.from({ length: 5 }, () =>
        mutations.abandon("goal-idempotent", goalId, "22222222-aaaa-4222-8222-222222222222")
      )
    );
    expect(abandons.filter((result) => !result.replayed)).toHaveLength(1);

    const auditRows = await testDb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, "goal-idempotent"));
    expect(auditRows.map((row) => row.action).sort()).toEqual(["goal.abandon", "goal.create"]);
  });

  it("atomically marks an achieved goal and enqueues one notification across concurrent cron runs", async () => {
    const accountId = await createAccount("goal-cron", "Goal Account", 0);
    const goal = await service.create("goal-cron", {
      name: "Tiny Goal",
      targetMinor: 100_000,
      fundingMode: "linked_account",
      linkedAccountId: accountId
    });
    await transactions.create(
      "goal-cron",
      {
        accountId,
        type: "income",
        amountMinor: 100_000,
        occurredAt: new Date(),
        description: "Finish goal",
        tags: []
      },
      undefined
    );

    process.env.SERVICE_ROLE = "worker";
    const cron = new GoalsProgressCron(
      testDb.db,
      new RuntimeConfigService(),
      goals,
      service,
      outbox,
      new AuditRepository(testDb.db),
      NOOP_LOGGER
    );
    await Promise.all(Array.from({ length: 5 }, () => cron.checkProgress()));

    const [stored] = await testDb.db
      .select()
      .from(goalsTable)
      .where(and(eq(goalsTable.userId, "goal-cron"), eq(goalsTable.id, goal.id)));
    expect(stored?.status).toBe("achieved");

    const notifications = await testDb.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.userId, "goal-cron"),
          eq(notificationOutbox.type, "goal_achieved")
        )
      );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.payload).toMatchObject({
      goalId: goal.id,
      name: "Tiny Goal",
      targetMinor: 100_000
    });
  });

  it("tracks manual envelope contributions with independent deposits and withdrawals", async () => {
    const goal = await service.create("goal-manual", {
      name: "Cash Envelope",
      targetMinor: 100_000,
      fundingMode: "manual_envelope"
    });
    expect(goal.fundingMode).toBe("manual_envelope");
    expect(goal.progressMinor).toBe(0);

    // Deposit 400
    const withDeposit = await service.recordContribution("goal-manual", goal.id, {
      type: "deposit",
      amountMinor: 40_000,
      note: "Cash gift"
    });
    expect(withDeposit.progressMinor).toBe(40_000);

    // Deposit 300
    await service.recordContribution("goal-manual", goal.id, {
      type: "deposit",
      amountMinor: 30_000,
      note: "Weekly savings"
    });

    // Withdraw 100
    const withWithdrawal = await service.recordContribution("goal-manual", goal.id, {
      type: "withdrawal",
      amountMinor: 10_000,
      note: "Small cash spend"
    });
    expect(withWithdrawal.progressMinor).toBe(60_000);

    // List contributions
    const history = await service.listContributions("goal-manual", goal.id);
    expect(history).toHaveLength(3);
    expect(history[0]?.type).toBe("withdrawal");
    expect(history[0]?.amountMinor).toBe(10_000);

    // Idempotent contribution mutation
    const key = "11111111-2222-3333-4444-555555555555";
    const mutationFirst = await mutations.recordContribution(
      "goal-manual",
      goal.id,
      { type: "deposit", amountMinor: 40_000, note: "Final push" },
      key
    );
    expect(mutationFirst.replayed).toBe(false);
    expect(mutationFirst.result.progressMinor).toBe(100_000);

    const mutationReplayed = await mutations.recordContribution(
      "goal-manual",
      goal.id,
      { type: "deposit", amountMinor: 40_000, note: "Final push" },
      key
    );
    expect(mutationReplayed.replayed).toBe(true);
    expect(mutationReplayed.result.progressMinor).toBe(100_000);

    // Verify audit log entry was written
    const auditEntries = await testDb.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.userId, "goal-manual"), eq(auditLog.action, "goal.contribute")));
    expect(auditEntries.length).toBeGreaterThanOrEqual(4);
  });

  async function createAccount(
    userId: string,
    name: string,
    openingBalanceMinor: number
  ): Promise<string> {
    const account = await withTxn(testDb.db, (tx) =>
      accounts.create(userId, { name, type: "bank", openingBalanceMinor }, tx)
    );
    return account.id;
  }
});

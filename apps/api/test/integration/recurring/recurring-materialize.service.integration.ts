import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import {
  accounts,
  auditLog,
  recurringRules,
  transactions as transactionsTable
} from "../../../src/common/db/schema/index.js";
import { RecurringMaterializeService } from "../../../src/recurring/recurring-materialize.service.js";
import { RecurringRuleRepository } from "../../../src/recurring/recurring-rule.repository.js";
import { RecurringRuleService } from "../../../src/recurring/recurring-rule.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const NOOP_LOGGER = { log: () => undefined, error: () => undefined };

describe("RecurringMaterializeService", () => {
  let testDb: TestDb;
  let accounts_: AccountRepository;
  let rules: RecurringRuleRepository;
  let ruleService: RecurringRuleService;
  let accountId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");

    process.env.DATABASE_URL = testDb.connectionUri;
    process.env.REDIS_URL = "redis://127.0.0.1:6379/12";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    accounts_ = new AccountRepository(testDb.db);
    rules = new RecurringRuleRepository(testDb.db);
    ruleService = new RecurringRuleService(
      testDb.db,
      rules,
      accounts_,
      new CategoryRepository(testDb.db)
    );

    const account = await withTxn(testDb.db, (tx) =>
      accounts_.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 500_000 },
        tx
      )
    );
    accountId = account.id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  function newMaterializer(serviceRole: "api" | "worker"): RecurringMaterializeService {
    process.env.SERVICE_ROLE = serviceRole;
    return new RecurringMaterializeService(
      testDb.db,
      new RuntimeConfigService(),
      rules,
      accounts_,
      new TransactionRepository(testDb.db),
      new AuditRepository(testDb.db),
      NOOP_LOGGER
    );
  }

  it("is a no-op when SERVICE_ROLE is not worker", async () => {
    const rule = await ruleService.create("user-a", {
      template: {
        accountId,
        type: "expense",
        amountMinor: 150_000,
        description: "Rent (api-role guard test)",
        tags: []
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2020-01-01T00:00:00.000Z")
    });

    await newMaterializer("api").materialize();

    const stored = await rules.findById("user-a", rule.id);
    expect(stored?.nextRunAt.toISOString()).toBe(rule.nextRunAt.toISOString());
    expect(stored?.lastRunAt).toBeUndefined();

    // findDue() sweeps globally across all rules regardless of which test
    // created them — pause this one so later tests' worker-role sweeps in
    // this same suite don't also pick it up (it's still "due" by design,
    // since the point of this test was that the guard left it untouched).
    await testDb.db
      .update(recurringRules)
      .set({ isPaused: true })
      .where(and(eq(recurringRules.userId, "user-a"), eq(recurringRules.id, rule.id)));
  });

  it("posts the templated txn, updates the balance, and advances nextRunAt", async () => {
    const rule = await ruleService.create("user-a", {
      template: {
        accountId,
        type: "expense",
        amountMinor: 150_000,
        description: "Rent",
        tags: ["housing"]
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2020-02-01T00:00:00.000Z")
    });

    const balanceBefore = await accountBalance();

    await newMaterializer("worker").materialize();

    const stored = await rules.findById("user-a", rule.id);
    expect(stored?.nextRunAt.toISOString()).toBe("2020-03-01T00:00:00.000Z");
    expect(stored?.lastRunAt?.toISOString()).toBe(rule.nextRunAt.toISOString());

    const [txn] = await testDb.db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, "user-a"),
          eq(transactionsTable.description, "Rent"),
          eq(transactionsTable.source, "recurring")
        )
      );
    expect(txn).toMatchObject({ amountMinor: 150_000, type: "expense" });
    expect(txn?.occurredAt.toISOString()).toBe(rule.nextRunAt.toISOString());

    expect(await accountBalance()).toBe(balanceBefore - 150_000);

    const [audit] = await testDb.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.userId, "user-a"), eq(auditLog.action, "recurring.materialize")));
    expect(audit).not.toBeUndefined();
  });

  it("posting the same due rule concurrently five times posts exactly one transaction", async () => {
    const rule = await ruleService.create("user-a", {
      template: {
        accountId,
        type: "expense",
        amountMinor: 5_000,
        description: "Netflix",
        tags: []
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2020-04-01T00:00:00.000Z")
    });

    process.env.SERVICE_ROLE = "worker";
    const materializer = newMaterializer("worker");
    await Promise.all(Array.from({ length: 5 }, () => materializer.materialize()));

    const posted = await testDb.db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, "user-a"),
          eq(transactionsTable.description, "Netflix"),
          eq(transactionsTable.source, "recurring")
        )
      );
    expect(posted.length).toBe(1);

    const stored = await rules.findById("user-a", rule.id);
    expect(stored?.nextRunAt.toISOString()).toBe("2020-05-01T00:00:00.000Z");
  });

  it("pauses a rule once its COUNT-limited rrule is exhausted", async () => {
    await ruleService.create("user-a", {
      template: {
        accountId,
        type: "expense",
        amountMinor: 1_000,
        description: "Short-lived subscription",
        tags: []
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1;COUNT=1",
      startAt: new Date("2020-06-01T00:00:00.000Z")
    });

    await newMaterializer("worker").materialize();

    const [stored] = await testDb.db
      .select()
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.userId, "user-a"),
          eq(recurringRules.templateDescription, "Short-lived subscription")
        )
      );
    expect(stored).toMatchObject({ isPaused: true });
  });

  async function accountBalance(): Promise<number> {
    const [account] = await testDb.db.select().from(accounts).where(eq(accounts.id, accountId));
    if (account === undefined) throw new Error("Account fixture not found");
    return account.balanceMinor;
  }
});

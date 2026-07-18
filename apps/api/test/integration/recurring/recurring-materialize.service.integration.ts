import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection, Types } from "mongoose";
import type { Connection } from "mongoose";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { AuditRepository } from "../../../src/audit/audit.repository.js";
import { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { withTxn } from "../../../src/common/mongo-txn.js";
import { RecurringMaterializeService } from "../../../src/recurring/recurring-materialize.service.js";
import { RecurringRuleRepository } from "../../../src/recurring/recurring-rule.repository.js";
import { RecurringRuleService } from "../../../src/recurring/recurring-rule.service.js";
import { TransactionRepository } from "../../../src/transactions/transaction.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";

const NOOP_LOGGER = { log: () => undefined, error: () => undefined };

describe("RecurringMaterializeService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let accounts: AccountRepository | undefined;
  let rules: RecurringRuleRepository | undefined;
  let ruleService: RecurringRuleService | undefined;
  let accountId: string | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replicaSet.getUri("vyaya_recurring_materialize_test");
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    process.env.REDIS_URL = "redis://127.0.0.1:6379/9";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    connection = await createConnection(
      replicaSet.getUri("vyaya_recurring_materialize_test")
    ).asPromise();
    accounts = new AccountRepository(connection);
    rules = new RecurringRuleRepository(connection);
    ruleService = new RecurringRuleService(
      connection,
      rules,
      accounts,
      new CategoryRepository(connection)
    );

    const account = await withTxn(connectedConnection(connection), (session) =>
      requireAccounts(accounts).create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 500_000 },
        session
      )
    );
    accountId = account.id;
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  function newMaterializer(serviceRole: "api" | "worker"): RecurringMaterializeService {
    process.env.SERVICE_ROLE = serviceRole;
    return new RecurringMaterializeService(
      connectedConnection(connection),
      new RuntimeConfigService(),
      requireRules(rules),
      requireAccounts(accounts),
      new TransactionRepository(connectedConnection(connection)),
      new AuditRepository(connectedConnection(connection)),
      NOOP_LOGGER
    );
  }

  it("is a no-op when SERVICE_ROLE is not worker", async () => {
    const rule = await requireRuleService(ruleService).create("user-a", {
      template: {
        accountId: requireId(accountId),
        type: "expense",
        amountMinor: 150_000,
        description: "Rent (api-role guard test)",
        tags: []
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2020-01-01T00:00:00.000Z")
    });

    await newMaterializer("api").materialize();

    const stored = await requireRules(rules).findById("user-a", rule.id);
    expect(stored?.nextRunAt.toISOString()).toBe(rule.nextRunAt.toISOString());
    expect(stored?.lastRunAt).toBeUndefined();

    // findDue() sweeps globally across all rules regardless of which test
    // created them — pause this one so later tests' worker-role sweeps in
    // this same suite don't also pick it up (it's still "due" by design,
    // since the point of this test was that the guard left it untouched).
    await connectedDatabase(connection)
      .collection("recurring_rules")
      .updateOne({ userId: "user-a", _id: toObjectId(rule.id) }, { $set: { isPaused: true } });
  });

  it("posts the templated txn, updates the balance, and advances nextRunAt", async () => {
    const rule = await requireRuleService(ruleService).create("user-a", {
      template: {
        accountId: requireId(accountId),
        type: "expense",
        amountMinor: 150_000,
        description: "Rent",
        tags: ["housing"]
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2020-02-01T00:00:00.000Z")
    });

    const before = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ _id: toObjectId(requireId(accountId)) });
    const balanceBefore = requireNumber(before?.balanceMinor);

    await newMaterializer("worker").materialize();

    const stored = await requireRules(rules).findById("user-a", rule.id);
    expect(stored?.nextRunAt.toISOString()).toBe("2020-03-01T00:00:00.000Z");
    expect(stored?.lastRunAt?.toISOString()).toBe(rule.nextRunAt.toISOString());

    const txn = await connectedDatabase(connection)
      .collection("transactions")
      .findOne({ userId: "user-a", description: "Rent", source: "recurring" });
    expect(txn).toMatchObject({
      amountMinor: 150_000,
      type: "expense",
      occurredAt: rule.nextRunAt
    });

    const after = await connectedDatabase(connection)
      .collection("accounts")
      .findOne({ _id: toObjectId(requireId(accountId)) });
    expect(requireNumber(after?.balanceMinor)).toBe(balanceBefore - 150_000);

    const audit = await connectedDatabase(connection)
      .collection("audit_log")
      .findOne({ userId: "user-a", action: "recurring.materialize" });
    expect(audit).not.toBeNull();
  });

  it("posting the same due rule concurrently five times posts exactly one transaction", async () => {
    const rule = await requireRuleService(ruleService).create("user-a", {
      template: {
        accountId: requireId(accountId),
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

    const count = await connectedDatabase(connection)
      .collection("transactions")
      .countDocuments({ userId: "user-a", description: "Netflix", source: "recurring" });
    expect(count).toBe(1);

    const stored = await requireRules(rules).findById("user-a", rule.id);
    expect(stored?.nextRunAt.toISOString()).toBe("2020-05-01T00:00:00.000Z");
  });

  it("pauses a rule once its COUNT-limited rrule is exhausted", async () => {
    await requireRuleService(ruleService).create("user-a", {
      template: {
        accountId: requireId(accountId),
        type: "expense",
        amountMinor: 1_000,
        description: "Short-lived subscription",
        tags: []
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1;COUNT=1",
      startAt: new Date("2020-06-01T00:00:00.000Z")
    });

    await newMaterializer("worker").materialize();

    const stored = await connectedDatabase(connection)
      .collection("recurring_rules")
      .findOne({ userId: "user-a", "template.description": "Short-lived subscription" });
    expect(stored).toMatchObject({ isPaused: true });
  });
});

function requireRuleService(service: RecurringRuleService | undefined): RecurringRuleService {
  if (service === undefined) throw new Error("Recurring rule service is not ready");
  return service;
}

function requireRules(rules: RecurringRuleRepository | undefined): RecurringRuleRepository {
  if (rules === undefined) throw new Error("Recurring rule repository is not ready");
  return rules;
}

function requireAccounts(accounts: AccountRepository | undefined): AccountRepository {
  if (accounts === undefined) throw new Error("Account repository is not ready");
  return accounts;
}

function requireId(id: string | undefined): string {
  if (id === undefined) throw new Error("Fixture id is not ready");
  return id;
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number") throw new Error("Expected a numeric field.");
  return value;
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

function toObjectId(id: string): InstanceType<typeof Types.ObjectId> {
  return new Types.ObjectId(id);
}

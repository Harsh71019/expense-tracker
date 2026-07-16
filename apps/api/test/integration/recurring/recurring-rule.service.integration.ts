import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/mongo-txn.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { InvalidRecurringRuleError } from "../../../src/common/errors/invalid-recurring-rule.error.js";
import { RecurringRuleRepository } from "../../../src/recurring/recurring-rule.repository.js";
import { RecurringRuleService } from "../../../src/recurring/recurring-rule.service.js";

describe("RecurringRuleService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;
  let service: RecurringRuleService | undefined;
  let accountId: string | undefined;
  let categoryId: string | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(
      replicaSet.getUri("vyaya_recurring_service_test")
    ).asPromise();
    const accounts = new AccountRepository(connection);
    const categories = new CategoryRepository(connection);
    service = new RecurringRuleService(
      connection,
      new RecurringRuleRepository(connection),
      accounts,
      categories
    );

    const account = await withTxn(connectedConnection(connection), (session) =>
      accounts.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 100_000 },
        session
      )
    );
    accountId = account.id;
    const category = await categories.create("user-a", { name: "Rent", kind: "expense" });
    categoryId = category.id;
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("creates a rule and seeds nextRunAt from the rrule/startAt", async () => {
    const created = await recurringRuleService(service).create("user-a", {
      template: {
        accountId: requireId(accountId),
        categoryId: requireId(categoryId),
        type: "expense",
        amountMinor: 150_000,
        description: "Rent",
        tags: ["housing"]
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2026-08-01T00:00:00.000Z")
    });

    expect(created.nextRunAt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(created.isPaused).toBe(false);
    expect(created.template.tags).toEqual(["housing"]);
  });

  it("rejects a rule whose account does not belong to the user", async () => {
    await expect(
      recurringRuleService(service).create("user-a", {
        template: {
          accountId: "0123456789abcdef01234567",
          type: "expense",
          amountMinor: 1_000,
          description: "Ghost account",
          tags: []
        },
        rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
        startAt: new Date("2026-08-01T00:00:00.000Z")
      })
    ).rejects.toThrow(EntityNotFoundError);
  });

  it("rejects a well-formed rrule that produces no occurrences", async () => {
    await expect(
      recurringRuleService(service).create("user-a", {
        template: {
          accountId: requireId(accountId),
          type: "expense",
          amountMinor: 1_000,
          description: "Never fires",
          tags: []
        },
        rrule: "FREQ=MONTHLY;BYMONTHDAY=1;UNTIL=20260101T000000Z",
        startAt: new Date("2026-08-01T00:00:00.000Z")
      })
    ).rejects.toThrow(InvalidRecurringRuleError);
  });

  it("lists only the calling user's rules", async () => {
    const rules = await recurringRuleService(service).list("user-a");
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((rule) => rule.userId === "user-a")).toBe(true);

    const otherUsersRules = await recurringRuleService(service).list("user-b");
    expect(otherUsersRules).toEqual([]);
  });

  it("a template-only patch leaves tags untouched (no accidental reset to [])", async () => {
    const created = await recurringRuleService(service).create("user-a", {
      template: {
        accountId: requireId(accountId),
        type: "expense",
        amountMinor: 5_000,
        description: "Netflix",
        tags: ["subscription"]
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=15",
      startAt: new Date("2026-08-15T00:00:00.000Z")
    });

    const updated = await recurringRuleService(service).update("user-a", created.id, {
      template: { amountMinor: 6_500 }
    });

    expect(updated.template.amountMinor).toBe(6_500);
    expect(updated.template.tags).toEqual(["subscription"]);
    expect(updated.nextRunAt.toISOString()).toBe(created.nextRunAt.toISOString());
  });

  it("changing the rrule recomputes nextRunAt", async () => {
    const created = await recurringRuleService(service).create("user-a", {
      template: {
        accountId: requireId(accountId),
        type: "expense",
        amountMinor: 2_000,
        description: "Gym",
        tags: []
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2026-08-01T00:00:00.000Z")
    });

    const updated = await recurringRuleService(service).update("user-a", created.id, {
      rrule: "FREQ=WEEKLY;BYDAY=MO"
    });

    expect(updated.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(updated.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("throws EntityNotFoundError when updating a rule that does not exist", async () => {
    await expect(
      recurringRuleService(service).update("user-a", "507f1f77bcf86cd799439011", { isPaused: true })
    ).rejects.toThrow(EntityNotFoundError);
  });

  it("does not allow updating another user's rule", async () => {
    const created = await recurringRuleService(service).create("user-a", {
      template: {
        accountId: requireId(accountId),
        type: "expense",
        amountMinor: 3_000,
        description: "Private",
        tags: []
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
      startAt: new Date("2026-08-05T00:00:00.000Z")
    });

    await expect(
      recurringRuleService(service).update("someone-else", created.id, { isPaused: true })
    ).rejects.toThrow(EntityNotFoundError);
  });
});

function recurringRuleService(service: RecurringRuleService | undefined): RecurringRuleService {
  if (service === undefined) throw new Error("Recurring rule service is not ready");
  return service;
}

function requireId(id: string | undefined): string {
  if (id === undefined) throw new Error("Fixture id is not ready");
  return id;
}

function connectedConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) throw new Error("MongoDB connection is not ready");
  return connection;
}

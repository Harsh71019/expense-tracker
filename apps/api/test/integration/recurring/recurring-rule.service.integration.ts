import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { EntityNotFoundError } from "../../../src/common/errors/entity-not-found.error.js";
import { InvalidRecurringRuleError } from "../../../src/common/errors/invalid-recurring-rule.error.js";
import { RecurringRuleRepository } from "../../../src/recurring/recurring-rule.repository.js";
import { RecurringRuleService } from "../../../src/recurring/recurring-rule.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("RecurringRuleService", () => {
  let testDb: TestDb;
  let service: RecurringRuleService;
  let accountId: string;
  let categoryId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    const accounts = new AccountRepository(testDb.db);
    const categories = new CategoryRepository(testDb.db);
    service = new RecurringRuleService(
      testDb.db,
      new RecurringRuleRepository(testDb.db),
      accounts,
      categories
    );

    const account = await withTxn(testDb.db, (tx) =>
      accounts.create(
        "user-a",
        { name: "HDFC Savings", type: "bank", openingBalanceMinor: 100_000 },
        tx
      )
    );
    accountId = account.id;
    const category = await categories.create("user-a", { name: "Rent", kind: "expense" });
    categoryId = category.id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("creates a rule and seeds nextRunAt from the rrule/startAt", async () => {
    const created = await service.create("user-a", {
      template: {
        accountId,
        categoryId,
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
      service.create("user-a", {
        template: {
          accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
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
      service.create("user-a", {
        template: {
          accountId,
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
    const rules = await service.list("user-a");
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((rule) => rule.userId === "user-a")).toBe(true);

    const otherUsersRules = await service.list("user-b");
    expect(otherUsersRules).toEqual([]);
  });

  it("a template-only patch leaves tags untouched (no accidental reset to [])", async () => {
    const created = await service.create("user-a", {
      template: {
        accountId,
        type: "expense",
        amountMinor: 5_000,
        description: "Netflix",
        tags: ["subscription"]
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=15",
      startAt: new Date("2026-08-15T00:00:00.000Z")
    });

    const updated = await service.update("user-a", created.id, {
      template: { amountMinor: 6_500 }
    });

    expect(updated.template.amountMinor).toBe(6_500);
    expect(updated.template.tags).toEqual(["subscription"]);
    expect(updated.nextRunAt.toISOString()).toBe(created.nextRunAt.toISOString());
  });

  it("changing the rrule recomputes nextRunAt", async () => {
    const created = await service.create("user-a", {
      template: {
        accountId,
        type: "expense",
        amountMinor: 2_000,
        description: "Gym",
        tags: []
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: new Date("2026-08-01T00:00:00.000Z")
    });

    const updated = await service.update("user-a", created.id, {
      rrule: "FREQ=WEEKLY;BYDAY=MO"
    });

    expect(updated.rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(updated.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("throws EntityNotFoundError when updating a rule that does not exist", async () => {
    await expect(
      service.update("user-a", "3fa85f64-5717-4562-b3fc-2c963f66beef", { isPaused: true })
    ).rejects.toThrow(EntityNotFoundError);
  });

  it("does not allow updating another user's rule", async () => {
    const created = await service.create("user-a", {
      template: {
        accountId,
        type: "expense",
        amountMinor: 3_000,
        description: "Private",
        tags: []
      },
      rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
      startAt: new Date("2026-08-05T00:00:00.000Z")
    });

    await expect(service.update("someone-else", created.id, { isPaused: true })).rejects.toThrow(
      EntityNotFoundError
    );
  });
});

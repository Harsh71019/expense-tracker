import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { RecurringRuleRepository } from "../recurring-rule.repository.js";

const RULE_ID = "123e4567-e89b-42d3-a456-426614174000";
const ACCOUNT_ID = "223e4567-e89b-42d3-a456-426614174000";
const CATEGORY_ID = "323e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const ROW = {
  id: RULE_ID,
  userId: "u1",
  templateAccountId: ACCOUNT_ID,
  templateCategoryId: null,
  templateType: "expense",
  templateAmountMinor: 50_000,
  templateDescription: "Rent",
  templateTags: [],
  rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
  startAt: NOW,
  nextRunAt: NOW,
  lastRunAt: null,
  isPaused: false,
  createdAt: NOW,
  updatedAt: NOW
};

describe("RecurringRuleRepository edge coverage", () => {
  it("creates categorized rules and rejects missing insert results", async () => {
    const found = createMockDrizzleDb([{ ...ROW, templateCategoryId: CATEGORY_ID }]);
    await expect(
      new RecurringRuleRepository(found).create(
        "u1",
        {
          template: {
            accountId: ACCOUNT_ID,
            categoryId: CATEGORY_ID,
            type: "expense",
            amountMinor: 50_000,
            description: "Rent",
            tags: []
          },
          rrule: ROW.rrule,
          startAt: NOW
        },
        NOW,
        // @ts-expect-error - fluent transaction double.
        found
      )
    ).resolves.toMatchObject({ template: { categoryId: CATEGORY_ID } });

    const missing = createMockDrizzleDb();
    await expect(
      new RecurringRuleRepository(missing).create(
        "u1",
        {
          template: {
            accountId: ACCOUNT_ID,
            type: "expense",
            amountMinor: 50_000,
            description: "Rent",
            tags: []
          },
          rrule: ROW.rrule,
          startAt: NOW
        },
        NOW,
        // @ts-expect-error - fluent transaction double.
        missing
      )
    ).rejects.toThrow("Recurring rule insert did not return a row.");
  });

  it("uses an explicit transaction for findById and returns null when absent", async () => {
    const found = createMockDrizzleDb([ROW]);
    await expect(
      new RecurringRuleRepository(found).findById(
        "u1",
        RULE_ID,
        // @ts-expect-error - fluent transaction double.
        found
      )
    ).resolves.toMatchObject({ id: RULE_ID });
    await expect(
      new RecurringRuleRepository(createMockDrizzleDb()).findById("u1", RULE_ID)
    ).resolves.toBeNull();
  });

  it("updates every optional field and handles an absent returned row", async () => {
    const updatedRow = {
      ...ROW,
      templateCategoryId: CATEGORY_ID,
      templateType: "income",
      isPaused: true
    };
    const found = createMockDrizzleDb([updatedRow]);
    const patch = {
      template: {
        accountId: ACCOUNT_ID,
        categoryId: CATEGORY_ID,
        type: "income" as const,
        amountMinor: 75_000,
        description: "Salary",
        tags: ["work"]
      },
      rrule: "FREQ=WEEKLY",
      isPaused: true
    };
    await expect(
      new RecurringRuleRepository(found).update(
        "u1",
        RULE_ID,
        patch,
        NOW,
        // @ts-expect-error - fluent transaction double.
        found
      )
    ).resolves.toMatchObject({ template: { type: "income" }, isPaused: true });

    const missing = createMockDrizzleDb();
    await expect(
      new RecurringRuleRepository(missing).update(
        "u1",
        RULE_ID,
        { isPaused: false },
        undefined,
        // @ts-expect-error - fluent transaction double.
        missing
      )
    ).resolves.toBeNull();
  });

  it("returns false when claimRun loses its compare-and-swap", async () => {
    const db = createMockDrizzleDb();
    await expect(
      new RecurringRuleRepository(db).claimRun(
        "u1",
        RULE_ID,
        NOW,
        NOW,
        true,
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).resolves.toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { RecurringRuleRepository } from "../recurring-rule.repository.js";

describe("RecurringRuleRepository Unit Tests", () => {
  const sampleRule = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    templateAccountId: "123e4567-e89b-12d3-a456-426614174001",
    templateCategoryId: null,
    templateType: "expense",
    templateAmountMinor: 2500000,
    templateDescription: "Monthly Rent",
    templateTags: ["housing"],
    rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
    startAt: new Date("2026-01-01"),
    nextRunAt: new Date("2026-01-01"),
    lastRunAt: null,
    isPaused: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("create inserts rule", async () => {
    const mockDb = createMockDrizzleDb([sampleRule]);
    const repo = new RecurringRuleRepository(mockDb);

    const res = await repo.create(
      "u1",
      {
        template: {
          accountId: "123e4567-e89b-12d3-a456-426614174001",
          type: "expense",
          amountMinor: 2500000,
          description: "Monthly Rent",
          tags: ["housing"]
        },
        rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
        startAt: new Date("2026-01-01"),
        autoPost: true
      },
      new Date("2026-01-01"),
      // @ts-expect-error mock tx
      mockDb
    );
    expect(res.id).toBe(sampleRule.id);
  });

  it("list returns rules for user", async () => {
    const mockDb = createMockDrizzleDb([sampleRule]);
    const repo = new RecurringRuleRepository(mockDb);

    const res = await repo.list("u1");
    expect(res).toHaveLength(1);
  });

  it("findById returns rule or null", async () => {
    const mockDb = createMockDrizzleDb([sampleRule]);
    const repo = new RecurringRuleRepository(mockDb);

    const res = await repo.findById("u1", sampleRule.id);
    expect(res?.id).toBe(sampleRule.id);
  });

  it("findDue returns rules due on or before date", async () => {
    const mockDb = createMockDrizzleDb([sampleRule]);
    const repo = new RecurringRuleRepository(mockDb);

    const res = await repo.findDue(new Date("2026-01-01"));
    expect(res).toHaveLength(1);
  });

  it("update updates recurring rule fields", async () => {
    const mockDb = createMockDrizzleDb([sampleRule]);
    const repo = new RecurringRuleRepository(mockDb);

    const res = await repo.update(
      "u1",
      sampleRule.id,
      { template: { description: "Updated Rent" }, isPaused: true },
      new Date("2026-02-01"),
      // @ts-expect-error mock tx
      mockDb
    );
    expect(res?.id).toBe(sampleRule.id);
  });

  it("claimRun advances nextRunAt atomically", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleRule.id }]);
    const repo = new RecurringRuleRepository(mockDb);

    const res = await repo.claimRun(
      "u1",
      sampleRule.id,
      new Date("2026-01-01"),
      new Date("2026-02-01"),
      false,
      // @ts-expect-error mock tx
      mockDb
    );
    expect(res).toBe(true);
  });
});

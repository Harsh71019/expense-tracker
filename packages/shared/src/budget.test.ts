import { describe, expect, it } from "vitest";

import { BudgetSchema, ListBudgetsQuerySchema, UpsertBudgetSchema } from "./budget.js";

const CATEGORY_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";

describe("UpsertBudgetSchema", () => {
  it("accepts a positive integer limit", () => {
    expect(UpsertBudgetSchema.parse({ limitMinor: 500_000_00 })).toEqual({
      limitMinor: 500_000_00
    });
  });

  it.each([0, -1, 1.5])("rejects a non-positive-integer limit %s", (limitMinor) => {
    expect(UpsertBudgetSchema.safeParse({ limitMinor }).success).toBe(false);
  });
});

describe("BudgetSchema", () => {
  it("round-trips a stored budget", () => {
    const now = new Date("2026-07-19T00:00:00.000Z");
    const parsed = BudgetSchema.parse({
      id: CATEGORY_ID,
      userId: "user-1",
      categoryId: CATEGORY_ID,
      limitMinor: 500_000_00,
      isArchived: false,
      createdAt: now,
      updatedAt: now
    });
    expect(parsed.limitMinor).toBe(500_000_00);
  });
});

describe("ListBudgetsQuerySchema", () => {
  it("defaults includeArchived to false and limit to 50", () => {
    expect(ListBudgetsQuerySchema.parse({})).toEqual({ limit: 50, includeArchived: false });
  });

  it("parses includeArchived=true from a query string value", () => {
    expect(ListBudgetsQuerySchema.parse({ includeArchived: "true" }).includeArchived).toBe(true);
  });

  it("treats includeArchived=false explicitly as false, not truthy-string", () => {
    expect(ListBudgetsQuerySchema.parse({ includeArchived: "false" }).includeArchived).toBe(false);
  });

  it("rejects a limit above 200", () => {
    expect(ListBudgetsQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
  });
});

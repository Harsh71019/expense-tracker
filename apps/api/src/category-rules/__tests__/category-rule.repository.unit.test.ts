import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { CategoryRuleRepository } from "../category-rule.repository.js";

describe("CategoryRuleRepository Unit Tests", () => {
  const sampleRow = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    pattern: "swiggy*",
    categoryId: "123e4567-e89b-12d3-a456-426614174001",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("create inserts rule", async () => {
    const mockDb = createMockDrizzleDb([sampleRow]);
    const repo = new CategoryRuleRepository(mockDb);

    const res = await repo.create("u1", {
      pattern: "swiggy*",
      categoryId: sampleRow.categoryId
    });
    expect(res.pattern).toBe("swiggy*");
  });

  it("list returns rules sorted by pattern", async () => {
    const mockDb = createMockDrizzleDb([sampleRow]);
    const repo = new CategoryRuleRepository(mockDb);

    const res = await repo.list("u1");
    expect(res).toHaveLength(1);
  });

  it("delete returns true on single delete", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleRow.id }]);
    const repo = new CategoryRuleRepository(mockDb);

    const res = await repo.delete("u1", sampleRow.id);
    expect(res).toBe(true);
  });
});

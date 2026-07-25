import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { CategoryRepository } from "../category.repository.js";

describe("CategoryRepository Unit Tests", () => {
  const sampleCategoryRow = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    name: "Groceries",
    kind: "expense",
    color: "#3366ff",
    icon: "shopping-cart",
    group: "essential",
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("create inserts category row", async () => {
    const mockDb = createMockDrizzleDb([sampleCategoryRow]);
    const repo = new CategoryRepository(mockDb);

    const res = await repo.create("u1", {
      name: "Groceries",
      kind: "expense",
      color: "#3366ff",
      icon: "shopping-cart"
    });
    expect(res.name).toBe("Groceries");
  });

  it("list returns non-archived categories", async () => {
    const mockDb = createMockDrizzleDb([sampleCategoryRow]);
    const repo = new CategoryRepository(mockDb);

    const res = await repo.list("u1");
    expect(res).toHaveLength(1);
  });

  it("findActiveById returns active category or null", async () => {
    const mockDb = createMockDrizzleDb([sampleCategoryRow]);
    const repo = new CategoryRepository(mockDb);

    const res = await repo.findActiveById("u1", sampleCategoryRow.id);
    expect(res?.id).toBe(sampleCategoryRow.id);
  });

  it("exists returns boolean indicating active presence", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleCategoryRow.id }]);
    const repo = new CategoryRepository(mockDb);

    const res = await repo.exists("u1", sampleCategoryRow.id);
    expect(res).toBe(true);
  });

  it("updateGroup updates category group classification", async () => {
    const mockDb = createMockDrizzleDb([sampleCategoryRow]);
    const repo = new CategoryRepository(mockDb);

    const res = await repo.updateGroup("u1", sampleCategoryRow.id, { group: "essential" });
    expect(res?.group).toBe("essential");
  });

  it("archive sets isArchived true", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleCategoryRow.id }]);
    const repo = new CategoryRepository(mockDb);

    const res = await repo.archive("u1", sampleCategoryRow.id);
    expect(res).toBe(true);
  });
});

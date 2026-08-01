import { describe, expect, it, vi } from "vitest";

import { CategoryService } from "../category.service.js";

describe("CategoryService Unit Tests", () => {
  const sampleCategory = {
    id: "cat_1",
    userId: "u1",
    name: "Groceries",
    kind: "expense" as const,
    group: "essential" as const,
    icon: "shopping-cart",
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("create inserts a category when parent match succeeds", async () => {
    const mockRepo = {
      findActiveById: vi.fn(async () => null),
      create: vi.fn(async () => sampleCategory)
    };

    // @ts-expect-error mock repo
    const service = new CategoryService(mockRepo);

    const res = await service.create("u1", {
      name: "Groceries",
      kind: "expense",
      group: "essential",
      icon: "shopping-cart"
    });

    expect(res.id).toBe("cat_1");
  });

  it("list returns active categories for user", async () => {
    const mockRepo = {
      list: vi.fn(async () => [sampleCategory])
    };

    // @ts-expect-error mock repo
    const service = new CategoryService(mockRepo);

    const res = await service.list("u1");
    expect(res).toHaveLength(1);
  });

  it("archive marks category archived", async () => {
    const mockRepo = {
      list: vi.fn(async () => [sampleCategory]),
      archive: vi.fn(async () => 1)
    };

    // @ts-expect-error mock repo
    const service = new CategoryService(mockRepo);

    await expect(service.archive("u1", "cat_1")).resolves.toBeUndefined();
    expect(mockRepo.archive).toHaveBeenCalledWith("u1", ["cat_1"], undefined);
  });

  it("updateGroup patches category group", async () => {
    const mockRepo = {
      updateGroup: vi.fn(async () => sampleCategory)
    };

    // @ts-expect-error mock repo
    const service = new CategoryService(mockRepo);

    const res = await service.updateGroup("u1", "cat_1", { group: "essential" });
    expect(res.id).toBe("cat_1");
  });
});

import { describe, expect, it, vi } from "vitest";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { CategoryRuleService } from "../category-rule.service.js";

const sampleCategory = {
  id: "507f1f77bcf86cd799439001",
  userId: "user-1",
  name: "Food",
  kind: "expense" as const,
  isArchived: false,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("CategoryRuleService", () => {
  it("creates a rule when the category exists and belongs to the user", async () => {
    const mockRules = { create: vi.fn().mockResolvedValue({ id: "rule-1" }) };
    const mockCategories = { list: vi.fn().mockResolvedValue([sampleCategory]) };
    const service = new CategoryRuleService(
      // @ts-expect-error - mock repository for unit testing
      mockRules,
      mockCategories
    );

    const result = await service.create("user-1", {
      pattern: "SWIGGY",
      categoryId: sampleCategory.id
    });

    expect(result).toEqual({ id: "rule-1" });
    expect(mockRules.create).toHaveBeenCalledWith("user-1", {
      pattern: "SWIGGY",
      categoryId: sampleCategory.id
    });
  });

  it("rejects creating a rule against a category that doesn't belong to the user", async () => {
    const mockRules = { create: vi.fn() };
    const mockCategories = { list: vi.fn().mockResolvedValue([]) };
    const service = new CategoryRuleService(
      // @ts-expect-error - mock repository for unit testing
      mockRules,
      mockCategories
    );

    await expect(
      service.create("user-1", { pattern: "SWIGGY", categoryId: sampleCategory.id })
    ).rejects.toThrow(EntityNotFoundError);
    expect(mockRules.create).not.toHaveBeenCalled();
  });

  it("throws when deleting a rule that doesn't exist or isn't the user's", async () => {
    const mockRules = { delete: vi.fn().mockResolvedValue(false) };
    // @ts-expect-error - mock repository for unit testing
    const service = new CategoryRuleService(mockRules, { list: vi.fn() });

    await expect(service.delete("user-1", "507f1f77bcf86cd799439099")).rejects.toThrow(
      EntityNotFoundError
    );
  });
});

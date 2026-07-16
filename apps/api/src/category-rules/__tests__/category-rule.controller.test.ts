import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { CategoryRuleController } from "../category-rule.controller.js";

const user: AuthenticatedUser = { id: "user-1" };

const sampleRule = {
  id: "507f1f77bcf86cd799439011",
  userId: "user-1",
  pattern: "SWIGGY",
  categoryId: "507f1f77bcf86cd799439001",
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("CategoryRuleController", () => {
  it("creates a rule from a validated body", async () => {
    const mockService = { create: vi.fn().mockResolvedValue(sampleRule) };
    // @ts-expect-error - mock CategoryRuleService for unit testing
    const controller = new CategoryRuleController(mockService);

    const result = await controller.create(user, {
      pattern: "SWIGGY",
      categoryId: sampleRule.categoryId
    });

    expect(result).toEqual(sampleRule);
    expect(mockService.create).toHaveBeenCalledWith("user-1", {
      pattern: "SWIGGY",
      categoryId: sampleRule.categoryId
    });
  });

  it("rejects a create body missing required fields before calling the service", () => {
    const mockService = { create: vi.fn() };
    // @ts-expect-error - mock CategoryRuleService for unit testing
    const controller = new CategoryRuleController(mockService);

    expect(() => controller.create(user, { pattern: "SWIGGY" })).toThrow();
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it("lists the user's rules", async () => {
    const mockService = { list: vi.fn().mockResolvedValue([sampleRule]) };
    // @ts-expect-error - mock CategoryRuleService for unit testing
    const controller = new CategoryRuleController(mockService);

    expect(await controller.list(user)).toEqual([sampleRule]);
    expect(mockService.list).toHaveBeenCalledWith("user-1");
  });

  it("deletes a rule by validated id", async () => {
    const mockService = { delete: vi.fn().mockResolvedValue(undefined) };
    // @ts-expect-error - mock CategoryRuleService for unit testing
    const controller = new CategoryRuleController(mockService);

    await controller.delete(user, "507f1f77bcf86cd799439011");
    expect(mockService.delete).toHaveBeenCalledWith("user-1", "507f1f77bcf86cd799439011");
  });
});

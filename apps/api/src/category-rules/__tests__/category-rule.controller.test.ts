import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { CategoryRuleController } from "../category-rule.controller.js";

const user: AuthenticatedUser = { id: "user-1" };

const sampleRule = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  pattern: "SWIGGY",
  categoryId: "3fa85f64-5717-4562-b3fc-2c963f66be01",
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

  it("rejects a create body missing required fields before calling the service", async () => {
    const mockService = { create: vi.fn() };
    // @ts-expect-error - mock CategoryRuleService for unit testing
    const controller = new CategoryRuleController(mockService);

    await expect(controller.create(user, { pattern: "SWIGGY" })).rejects.toThrow();
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

    await controller.delete(user, "3fa85f64-5717-4562-b3fc-2c963f66beef");
    expect(mockService.delete).toHaveBeenCalledWith(
      "user-1",
      "3fa85f64-5717-4562-b3fc-2c963f66beef"
    );
  });

  it("uses replay-aware create and delete mutations", async () => {
    const mockService = { create: vi.fn(), delete: vi.fn() };
    const mockMutations = {
      create: vi.fn().mockResolvedValue({ result: sampleRule, replayed: true }),
      delete: vi.fn().mockResolvedValue({ result: null, replayed: true })
    };
    // @ts-expect-error - mock services for unit testing
    const controller = new CategoryRuleController(mockService, mockMutations);
    const response = { status: vi.fn(), setHeader: vi.fn() };
    response.status.mockReturnValue(response);

    await controller.create(
      user,
      { pattern: "SWIGGY", categoryId: sampleRule.categoryId },
      "21212121-aaaa-4212-8212-212121212121",
      // @ts-expect-error - mock Response for unit testing
      response
    );
    await controller.delete(
      user,
      sampleRule.id,
      "22222222-bbbb-4222-8222-222222222222",
      // @ts-expect-error - mock Response for unit testing
      response
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });
});

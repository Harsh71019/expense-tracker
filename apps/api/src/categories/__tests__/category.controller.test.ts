import { describe, expect, it, vi } from "vitest";
import { CategoryController } from "../category.controller.js";
import type { AuthenticatedUser } from "../../auth/auth.guard.js";

describe("CategoryController", () => {
  const user: AuthenticatedUser = { id: "user-1" };

  it("calls create on the category service with validated input", async () => {
    const mockCreatedCategory = {
      id: "cat-1",
      userId: "user-1",
      name: "Food",
      kind: "expense" as const,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mockService = {
      create: vi.fn().mockResolvedValue(mockCreatedCategory),
      list: vi.fn(),
      archive: vi.fn()
    };

    // @ts-expect-error - mock CategoryService for unit testing
    const controller = new CategoryController(mockService);
    const body = { name: "Food", kind: "expense" };
    const result = await controller.create(user, body);

    expect(result).toEqual(mockCreatedCategory);
    expect(mockService.create).toHaveBeenCalledWith("user-1", {
      name: "Food",
      kind: "expense"
    });
  });

  it("calls list on the category service and returns categories list", async () => {
    const mockService = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      archive: vi.fn()
    };

    // @ts-expect-error - mock CategoryService for unit testing
    const controller = new CategoryController(mockService);
    const result = await controller.list(user);

    expect(result).toEqual([]);
    expect(mockService.list).toHaveBeenCalledWith("user-1");
  });

  it("calls archive on the category service", async () => {
    const mockService = {
      create: vi.fn(),
      list: vi.fn(),
      archive: vi.fn().mockResolvedValue(undefined)
    };

    // @ts-expect-error - mock CategoryService for unit testing
    const controller = new CategoryController(mockService);
    await controller.archive(user, "507f1f77bcf86cd799439011");

    expect(mockService.archive).toHaveBeenCalledWith("user-1", "507f1f77bcf86cd799439011");
  });
});

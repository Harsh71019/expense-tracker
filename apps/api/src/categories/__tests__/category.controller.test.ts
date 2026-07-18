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
    await controller.archive(user, "3fa85f64-5717-4562-b3fc-2c963f66beef");

    expect(mockService.archive).toHaveBeenCalledWith(
      "user-1",
      "3fa85f64-5717-4562-b3fc-2c963f66beef"
    );
  });

  it("uses replay-aware create and archive mutations", async () => {
    const category = {
      id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      userId: "user-1",
      name: "Food",
      kind: "expense" as const,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const mockService = { create: vi.fn(), list: vi.fn(), archive: vi.fn() };
    const mockMutations = {
      create: vi.fn().mockResolvedValue({ result: category, replayed: true }),
      archive: vi.fn().mockResolvedValue({ result: null, replayed: true })
    };
    // @ts-expect-error - mock services for unit testing
    const controller = new CategoryController(mockService, mockMutations);
    const response = { status: vi.fn(), setHeader: vi.fn() };
    response.status.mockReturnValue(response);

    await controller.create(
      user,
      { name: "Food", kind: "expense" },
      "19191919-aaaa-4191-8191-191919191919",
      // @ts-expect-error - mock Response for unit testing
      response
    );
    await controller.archive(
      user,
      category.id,
      "20202020-aaaa-4202-8202-202020202020",
      // @ts-expect-error - mock Response for unit testing
      response
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });
});

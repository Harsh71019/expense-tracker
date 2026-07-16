import { describe, expect, it, vi } from "vitest";
import { AccountController } from "../account.controller.js";
import type { AuthenticatedUser } from "../../auth/auth.guard.js";

describe("AccountController", () => {
  const user: AuthenticatedUser = { id: "user-1" };

  it("calls create on the account service with validated input", async () => {
    const mockCreatedAccount = {
      id: "acc-1",
      userId: "user-1",
      name: "Cash",
      type: "cash" as const,
      currency: "INR" as const,
      openingBalanceMinor: 5000,
      balanceMinor: 5000,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mockService = {
      create: vi.fn().mockResolvedValue(mockCreatedAccount),
      list: vi.fn(),
      archive: vi.fn()
    };

    // @ts-expect-error - mock AccountService for unit testing
    const controller = new AccountController(mockService);
    const body = { name: "Cash", type: "cash", openingBalanceMinor: 5000 };
    const result = await controller.create(user, body);

    expect(result).toEqual(mockCreatedAccount);
    expect(mockService.create).toHaveBeenCalledWith("user-1", {
      name: "Cash",
      type: "cash",
      openingBalanceMinor: 5000
    });
  });

  it("calls list on the account service and returns active accounts list", async () => {
    const mockService = {
      create: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      archive: vi.fn()
    };

    // @ts-expect-error - mock AccountService for unit testing
    const controller = new AccountController(mockService);
    const result = await controller.list(user);

    expect(result).toEqual([]);
    expect(mockService.list).toHaveBeenCalledWith("user-1");
  });

  it("calls archive on the account service", async () => {
    const mockService = {
      create: vi.fn(),
      list: vi.fn(),
      archive: vi.fn().mockResolvedValue(undefined)
    };

    // @ts-expect-error - mock AccountService for unit testing
    const controller = new AccountController(mockService);
    await controller.archive(user, "507f1f77bcf86cd799439011");

    expect(mockService.archive).toHaveBeenCalledWith("user-1", "507f1f77bcf86cd799439011");
  });
});

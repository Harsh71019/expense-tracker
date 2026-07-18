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

  it("uses replay-aware mutations and requires an idempotency key", async () => {
    const account = {
      id: "507f1f77bcf86cd799439011",
      userId: "user-1",
      name: "Cash",
      type: "cash" as const,
      currency: "INR" as const,
      openingBalanceMinor: 0,
      balanceMinor: 0,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const mockService = { create: vi.fn(), list: vi.fn(), archive: vi.fn() };
    const mockMutations = {
      create: vi.fn().mockResolvedValue({ result: account, replayed: true }),
      archive: vi.fn().mockResolvedValue({ result: null, replayed: true })
    };
    // @ts-expect-error - mock services for unit testing
    const controller = new AccountController(mockService, mockMutations);
    const response = { status: vi.fn(), setHeader: vi.fn() };
    response.status.mockReturnValue(response);

    await controller.create(
      user,
      { name: "Cash", type: "cash", openingBalanceMinor: 0 },
      "17171717-aaaa-4171-8171-171717171717",
      // @ts-expect-error - mock Response for unit testing
      response
    );
    await controller.archive(
      user,
      account.id,
      "18181818-aaaa-4181-8181-181818181818",
      // @ts-expect-error - mock Response for unit testing
      response
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
    await expect(
      controller.create(
        user,
        { name: "Cash", type: "cash", openingBalanceMinor: 0 },
        undefined,
        // @ts-expect-error - mock Response for unit testing
        response
      )
    ).rejects.toThrow();
  });
});

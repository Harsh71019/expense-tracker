import { describe, expect, it, vi } from "vitest";
import { NetWorthController } from "../net-worth.controller.js";
import type { AuthenticatedUser } from "../../auth/auth.guard.js";

describe("NetWorthController", () => {
  const user: AuthenticatedUser = { id: "user-1" };

  it("returns the net worth snapshot for the current user", async () => {
    const netWorth = {
      asOf: new Date(),
      netWorthMinor: 500_000_00,
      accounts: [],
      assets: []
    };
    const mockService = { get: vi.fn().mockResolvedValue(netWorth) };

    // @ts-expect-error - mock NetWorthService for unit testing
    const controller = new NetWorthController(mockService);
    const result = await controller.get(user);

    expect(result).toEqual(netWorth);
    expect(mockService.get).toHaveBeenCalledWith("user-1");
  });
});

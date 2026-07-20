import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { ApiKeysController } from "../api-keys.controller.js";

const user: AuthenticatedUser = { id: "user-1" };

const sampleKey = {
  id: "key-1",
  name: "n8n",
  start: "ak_ab",
  permissions: { transactions: ["write"] },
  enabled: true,
  createdAt: new Date(),
  expiresAt: null,
  lastRequest: null
};

describe("ApiKeysController", () => {
  it("creates a key from a validated body", async () => {
    const mockService = { create: vi.fn().mockResolvedValue({ ...sampleKey, key: "ak_secret" }) };
    // @ts-expect-error - mock ApiKeysService for unit testing
    const controller = new ApiKeysController(mockService);

    const result = await controller.create(user, {
      name: "n8n",
      permissions: { transactions: ["write"] }
    });

    expect(result).toMatchObject({ id: "key-1", key: "ak_secret" });
    expect(mockService.create).toHaveBeenCalledWith("user-1", {
      name: "n8n",
      permissions: { transactions: ["write"] }
    });
  });

  it("rejects a create body with an unknown scope before calling the service", async () => {
    const mockService = { create: vi.fn() };
    // @ts-expect-error - mock ApiKeysService for unit testing
    const controller = new ApiKeysController(mockService);

    await expect(
      controller.create(user, { name: "n8n", permissions: { transactions: ["delete"] } })
    ).rejects.toThrow();
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it("lists keys by forwarding the raw request", async () => {
    const mockService = { list: vi.fn().mockResolvedValue([sampleKey]) };
    // @ts-expect-error - mock ApiKeysService for unit testing
    const controller = new ApiKeysController(mockService);
    const mockRequest = { headers: {} };

    // @ts-expect-error - mock Express Request for unit testing
    expect(await controller.list(mockRequest)).toEqual([sampleKey]);
    expect(mockService.list).toHaveBeenCalledWith(mockRequest);
  });

  it("updates a key by validated id and body", async () => {
    const mockService = { update: vi.fn().mockResolvedValue({ ...sampleKey, name: "renamed" }) };
    // @ts-expect-error - mock ApiKeysService for unit testing
    const controller = new ApiKeysController(mockService);

    const result = await controller.update(user, "key-1", { name: "renamed" });

    expect(result.name).toBe("renamed");
    expect(mockService.update).toHaveBeenCalledWith("user-1", "key-1", { name: "renamed" });
  });

  it("revokes a key by validated id", async () => {
    const mockService = { revoke: vi.fn().mockResolvedValue(undefined) };
    // @ts-expect-error - mock ApiKeysService for unit testing
    const controller = new ApiKeysController(mockService);

    await controller.revoke(user, "key-1");
    expect(mockService.revoke).toHaveBeenCalledWith("user-1", "key-1");
  });
});

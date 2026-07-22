import { describe, expect, it, vi } from "vitest";

import { ApiKeysService } from "../api-keys.service.js";

function pluginKey(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "key-1",
    name: "n8n",
    start: "ak_ab",
    permissions: { transactions: ["write"] },
    enabled: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: null,
    lastRequest: null,
    ...overrides
  };
}

describe("ApiKeysService", () => {
  it("creates a key, passing the caller's userId and the raw permissions through", async () => {
    const mockAuthService = {
      auth: {
        api: { createApiKey: vi.fn().mockResolvedValue({ ...pluginKey(), key: "ak_secret" }) }
      }
    };
    // @ts-expect-error - mock AuthService for unit testing
    const service = new ApiKeysService(mockAuthService);

    const result = await service.create("user-1", {
      name: "n8n",
      permissions: { transactions: ["write"] }
    });

    expect(mockAuthService.auth.api.createApiKey).toHaveBeenCalledWith({
      body: {
        userId: "user-1",
        name: "n8n",
        permissions: { transactions: ["write"] },
        prefix: "ak_"
      }
    });
    expect(result).toMatchObject({ id: "key-1", key: "ak_secret" });
  });

  it("converts an expiresAt date into expiresIn seconds for createApiKey", async () => {
    const createApiKey = vi
      .fn<(input: { body: { expiresIn?: number } }) => Promise<Record<string, unknown>>>()
      .mockResolvedValue({ ...pluginKey(), key: "ak_secret" });
    const mockAuthService = { auth: { api: { createApiKey } } };
    // @ts-expect-error - mock AuthService for unit testing
    const service = new ApiKeysService(mockAuthService);
    const expiresAt = new Date(Date.now() + 3_600_000);

    await service.create("user-1", { name: "n8n", permissions: { accounts: ["read"] }, expiresAt });

    const call = createApiKey.mock.calls[0]?.[0];
    expect(call?.body.expiresIn).toBeGreaterThan(3_500);
    expect(call?.body.expiresIn).toBeLessThanOrEqual(3_600);
  });

  it("lists keys by forwarding the request's headers, not a userId", async () => {
    const mockAuthService = {
      auth: { api: { listApiKeys: vi.fn().mockResolvedValue({ apiKeys: [pluginKey()] }) } }
    };
    // @ts-expect-error - mock AuthService for unit testing
    const service = new ApiKeysService(mockAuthService);
    const mockRequest = { headers: { cookie: "better-auth.session_token=abc" } };

    // @ts-expect-error - mock Express Request for unit testing
    const result = await service.list(mockRequest);

    expect(mockAuthService.auth.api.listApiKeys).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(result).toEqual([expect.objectContaining({ id: "key-1", name: "n8n", start: "ak_ab" })]);
  });

  it("updates a key, scoping by the caller's userId", async () => {
    const mockAuthService = {
      auth: { api: { updateApiKey: vi.fn().mockResolvedValue(pluginKey({ name: "renamed" })) } }
    };
    // @ts-expect-error - mock AuthService for unit testing
    const service = new ApiKeysService(mockAuthService);

    const result = await service.update("user-1", "key-1", { name: "renamed" });

    expect(mockAuthService.auth.api.updateApiKey).toHaveBeenCalledWith({
      body: { keyId: "key-1", userId: "user-1", name: "renamed" }
    });
    expect(result.name).toBe("renamed");
  });

  it("revokes a key by disabling it via updateApiKey, scoped by userId", async () => {
    const mockAuthService = {
      auth: { api: { updateApiKey: vi.fn().mockResolvedValue(pluginKey({ enabled: false })) } }
    };
    // @ts-expect-error - mock AuthService for unit testing
    const service = new ApiKeysService(mockAuthService);

    await service.revoke("user-1", "key-1");

    expect(mockAuthService.auth.api.updateApiKey).toHaveBeenCalledWith({
      body: { keyId: "key-1", userId: "user-1", enabled: false }
    });
  });
});

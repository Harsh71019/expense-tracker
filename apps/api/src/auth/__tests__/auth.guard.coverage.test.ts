import { describe, expect, it, vi } from "vitest";

import { InsufficientScopeError } from "../../common/errors/insufficient-scope.error.js";
import { RateLimitedError } from "../../common/errors/rate-limited.error.js";
import { UnauthenticatedError } from "../../common/errors/unauthenticated.error.js";
import { AuthGuard } from "../auth.guard.js";

function createContext(authorization: string) {
  const request = { headers: { authorization } };
  return {
    request,
    context: {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(request) })
    }
  };
}

function createGuard(response: unknown, scopes: unknown = { transactions: ["read"] }) {
  const auth = {
    auth: {
      api: {
        verifyApiKey: vi.fn().mockResolvedValue(response),
        getSession: vi.fn().mockResolvedValue(null)
      }
    }
  };
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => (key === "requireScopes" ? scopes : false))
  };
  const logging = { set: vi.fn() };
  // @ts-expect-error - focused collaborators implement guard calls.
  return { guard: new AuthGuard(auth, {}, reflector, logging), auth, logging };
}

describe("AuthGuard parser edge coverage", () => {
  it("uses the default retry duration when rate-limit details are absent", async () => {
    const { guard } = createGuard({
      valid: false,
      error: { code: "RATE_LIMITED" },
      key: null
    });
    const { context } = createContext("Bearer key");
    const error: unknown = await guard
      // @ts-expect-error - focused execution-context double.
      .canActivate(context)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error).toMatchObject({ headers: { "Retry-After": "60" } });
  });

  it("accepts a valid key with null prefix and omits it from logging context", async () => {
    const { guard, logging } = createGuard({
      valid: true,
      error: null,
      key: {
        id: "key-1",
        referenceId: "u1",
        prefix: null,
        permissions: { transactions: ["read"] }
      }
    });
    const { context } = createContext("Bearer key");
    await expect(
      // @ts-expect-error - focused execution-context double.
      guard.canActivate(context)
    ).resolves.toBe(true);
    expect(logging.set).toHaveBeenCalledWith({ userId: "u1", apiKeyId: "key-1" });
  });

  it("treats empty bearer values as absent and falls back to session auth", async () => {
    const { guard, auth } = createGuard({});
    const { context } = createContext("Bearer    ");
    await expect(
      // @ts-expect-error - focused execution-context double.
      guard.canActivate(context)
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(auth.auth.api.verifyApiKey).not.toHaveBeenCalled();
  });

  it("rejects null permissions and malformed top-level responses", async () => {
    const responses = [
      null,
      "invalid",
      { valid: "yes", error: null, key: null },
      {
        valid: true,
        error: null,
        key: { id: "key", referenceId: "u1", prefix: 123, permissions: null }
      }
    ];
    for (const response of responses) {
      const { guard } = createGuard(response);
      const { context } = createContext("Bearer key");
      await expect(
        // @ts-expect-error - focused execution-context double.
        guard.canActivate(context)
      ).rejects.toBeInstanceOf(
        response !== null && typeof response === "object" && "key" in response
          ? response.valid === true
            ? InsufficientScopeError
            : UnauthenticatedError
          : UnauthenticatedError
      );
    }
  });

  it("ignores malformed error fields, malformed keys, and non-string permission entries", async () => {
    const responses = [
      { valid: false, error: { code: 123, details: { tryAgainIn: "soon" } }, key: null },
      { valid: true, error: null, key: "not-an-object" },
      {
        valid: true,
        error: null,
        key: {
          id: "key",
          referenceId: "u1",
          prefix: "ak_",
          permissions: { transactions: [123] }
        }
      }
    ];
    for (const response of responses) {
      const { guard } = createGuard(response);
      const { context } = createContext("Bearer key");
      await expect(
        // @ts-expect-error - focused execution-context double.
        guard.canActivate(context)
      ).rejects.toThrow();
    }
  });
});

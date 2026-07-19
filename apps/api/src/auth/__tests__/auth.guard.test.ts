import { describe, expect, it, vi } from "vitest";
import { AuthGuard } from "../auth.guard.js";
import { UnauthenticatedError } from "../../common/errors/unauthenticated.error.js";
import { InsufficientScopeError } from "../../common/errors/insufficient-scope.error.js";
import { RateLimitedError } from "../../common/errors/rate-limited.error.js";

describe("AuthGuard", () => {
  it("returns true immediately if the route is marked public", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(true)
    };

    // @ts-expect-error - mock Reflector for unit testing
    const guard = new AuthGuard({}, {}, mockReflector, { set: vi.fn() });

    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn()
    };

    // @ts-expect-error - mock ExecutionContext
    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
    expect(mockReflector.getAllAndOverride).toHaveBeenCalled();
  });

  it("authenticates and ensures profile for valid session", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false)
    };

    const mockSession = {
      user: {
        id: "user-1",
        name: "Harsh"
      }
    };

    const mockAuthService = {
      auth: {
        api: {
          getSession: vi.fn().mockResolvedValue(mockSession)
        }
      }
    };

    const mockUserProfileService = {
      ensure: vi.fn().mockResolvedValue({})
    };

    const mockLoggingContext = { set: vi.fn() };

    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      mockUserProfileService,
      mockReflector,
      mockLoggingContext
    );

    const mockRequest = {
      headers: {
        cookie: "session-cookie"
      },
      authUser: undefined
    };

    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue(mockRequest)
      })
    };

    // @ts-expect-error - mock ExecutionContext
    const result = await guard.canActivate(mockContext);

    expect(result).toBe(true);
    expect(mockUserProfileService.ensure).toHaveBeenCalledWith("user-1", "Harsh");
    expect(mockLoggingContext.set).toHaveBeenCalledWith({ userId: "user-1" });
    expect(mockRequest.authUser).toEqual({ id: "user-1" });
  });

  it("throws UnauthenticatedError when session is null", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false)
    };

    const mockAuthService = {
      auth: {
        api: {
          getSession: vi.fn().mockResolvedValue(null)
        }
      }
    };

    // @ts-expect-error - mock services for unit testing
    const guard = new AuthGuard(mockAuthService, {}, mockReflector, { set: vi.fn() });

    const mockRequest = {
      headers: {}
    };

    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue(mockRequest)
      })
    };

    // @ts-expect-error - mock ExecutionContext
    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthenticatedError);
  });

  it("authenticates via a valid Bearer API key on a scoped route", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === "requireScopes" ? { transactions: ["write"] } : false
      )
    };
    const mockAuthService = {
      auth: {
        api: {
          verifyApiKey: vi.fn().mockResolvedValue({
            valid: true,
            error: null,
            key: { id: "key-1", referenceId: "user-1", prefix: "ak_" }
          })
        }
      }
    };
    const mockLoggingContext = { set: vi.fn() };
    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      {},
      mockReflector,
      mockLoggingContext
    );
    const mockRequest = { headers: { authorization: "Bearer ak_test123" } };
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(mockRequest) })
    };

    // @ts-expect-error - mock ExecutionContext
    const result = await guard.canActivate(mockContext);

    expect(result).toBe(true);
    expect(mockRequest).toMatchObject({ authUser: { id: "user-1" }, authMethod: "api-key" });
    expect(mockAuthService.auth.api.verifyApiKey).toHaveBeenCalledWith({
      body: { key: "ak_test123", permissions: { transactions: ["write"] } }
    });
    expect(mockLoggingContext.set).toHaveBeenCalledWith({
      userId: "user-1",
      apiKeyId: "key-1",
      apiKeyPrefix: "ak_"
    });
  });

  it("rejects a Bearer key on a route with no RequireScopes metadata, without calling verifyApiKey", async () => {
    const mockReflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const mockAuthService = { auth: { api: { verifyApiKey: vi.fn() } } };
    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      {},
      mockReflector,
      { set: vi.fn() }
    );
    const mockRequest = { headers: { authorization: "Bearer ak_test123" } };
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(mockRequest) })
    };

    // @ts-expect-error - mock ExecutionContext
    await expect(guard.canActivate(mockContext)).rejects.toThrow(InsufficientScopeError);
    expect(mockAuthService.auth.api.verifyApiKey).not.toHaveBeenCalled();
  });

  it("throws InsufficientScopeError when verifyApiKey returns INSUFFICIENT_API_KEY_PERMISSIONS", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === "requireScopes" ? { transactions: ["write"] } : false
      )
    };
    const mockAuthService = {
      auth: {
        api: {
          verifyApiKey: vi.fn().mockResolvedValue({
            valid: false,
            error: { code: "INSUFFICIENT_API_KEY_PERMISSIONS" },
            key: null
          })
        }
      }
    };
    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      {},
      mockReflector,
      { set: vi.fn() }
    );
    const mockRequest = { headers: { authorization: "Bearer ak_test123" } };
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(mockRequest) })
    };

    // @ts-expect-error - mock ExecutionContext
    await expect(guard.canActivate(mockContext)).rejects.toThrow(InsufficientScopeError);
  });

  it("throws InsufficientScopeError when verifyApiKey throws INSUFFICIENT_API_KEY_PERMISSIONS", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === "requireScopes" ? { transactions: ["write"] } : false
      )
    };
    const mockAuthService = {
      auth: {
        api: {
          verifyApiKey: vi
            .fn()
            .mockRejectedValue({ body: { code: "INSUFFICIENT_API_KEY_PERMISSIONS" } })
        }
      }
    };
    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      {},
      mockReflector,
      { set: vi.fn() }
    );
    const mockRequest = { headers: { authorization: "Bearer ak_test123" } };
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(mockRequest) })
    };

    // @ts-expect-error - mock ExecutionContext
    await expect(guard.canActivate(mockContext)).rejects.toThrow(InsufficientScopeError);
  });

  it("throws RateLimitedError with Retry-After derived from tryAgainIn", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === "requireScopes" ? { transactions: ["write"] } : false
      )
    };
    const mockAuthService = {
      auth: {
        api: {
          verifyApiKey: vi.fn().mockResolvedValue({
            valid: false,
            error: { code: "RATE_LIMIT_EXCEEDED", details: { tryAgainIn: 30_500 } },
            key: null
          })
        }
      }
    };
    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      {},
      mockReflector,
      { set: vi.fn() }
    );
    const mockRequest = { headers: { authorization: "Bearer ak_test123" } };
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(mockRequest) })
    };

    // @ts-expect-error - mock ExecutionContext
    const error: unknown = await guard.canActivate(mockContext).catch((caught: unknown) => caught);
    if (!(error instanceof RateLimitedError)) {
      throw new Error("expected RateLimitedError");
    }
    expect(error.headers).toEqual({ "Retry-After": "31" });
  });

  it("throws UnauthenticatedError for an invalid/expired/disabled key", async () => {
    const mockReflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === "requireScopes" ? { transactions: ["write"] } : false
      )
    };
    const mockAuthService = {
      auth: {
        api: {
          verifyApiKey: vi
            .fn()
            .mockResolvedValue({ valid: false, error: { code: "KEY_NOT_FOUND" }, key: null })
        }
      }
    };
    const guard = new AuthGuard(
      // @ts-expect-error - mock services for unit testing
      mockAuthService,
      {},
      mockReflector,
      { set: vi.fn() }
    );
    const mockRequest = { headers: { authorization: "Bearer ak_test123" } };
    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(mockRequest) })
    };

    // @ts-expect-error - mock ExecutionContext
    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthenticatedError);
  });
});

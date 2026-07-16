import { describe, expect, it, vi } from "vitest";
import { AuthGuard } from "../auth.guard.js";
import { UnauthenticatedError } from "../../common/errors/unauthenticated.error.js";

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
});

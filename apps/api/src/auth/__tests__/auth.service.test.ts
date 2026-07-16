import { describe, expect, it, vi } from "vitest";

// Capture the configuration passed to betterAuth
let betterAuthMockConfig: {
  baseURL?: string;
  emailAndPassword?: { disableSignUp: boolean };
  databaseHooks?: {
    user?: {
      create?: {
        after?: (user: { id: string; name: string }) => Promise<void>;
      };
    };
  };
} | null = null;

vi.mock("better-auth/minimal", () => {
  return {
    betterAuth: vi.fn().mockImplementation((config) => {
      betterAuthMockConfig = config;
      return { api: {} };
    })
  };
});

vi.mock("../redis-secondary-storage.js", () => {
  return {
    createRedisSecondaryStorage: vi.fn().mockReturnValue({})
  };
});

import { AuthService } from "../auth.service.js";
import { RuntimeConfigService } from "../../common/config/runtime-config.service.js";

class MockRuntimeConfigService implements RuntimeConfigService {
  env = {
    NODE_ENV: "test" as const,
    API_PORT: 4000,
    LOG_LEVEL: "info" as const,
    SERVICE_ROLE: "api" as const,
    MONGODB_URI: "mongodb://localhost:27017/test",
    REDIS_URL: "redis://localhost:6379",
    APP_TIMEZONE: "Asia/Kolkata" as const,
    TRUSTED_ORIGINS: "http://localhost:3000",
    GIT_SHA: "abcd-1234",
    BETTER_AUTH_SECRET: "test-secret-long-enough-32-chars-long",
    BETTER_AUTH_URL: "http://localhost:4000",
    AUTH_COOKIE_SECURE: false,
    DISABLE_SIGNUP: false
  };

  trustedOrigins(): string[] {
    return ["http://localhost:3000"];
  }
}

describe("AuthService", () => {
  it("instantiates betterAuth with configuration and hooks", async () => {
    const mockDb = {};
    const mockClient = {
      db: () => mockDb
    };
    const mockConnection = {
      getClient: () => mockClient
    };

    const mockConfig = new MockRuntimeConfigService();
    const mockRedis = {};
    const mockUserProfileService = {
      ensure: vi.fn().mockResolvedValue(undefined)
    };
    const mockLogger = {
      warn: vi.fn()
    };

    // @ts-expect-error - mock dependencies for unit testing
    new AuthService(mockConnection, mockConfig, mockRedis, mockUserProfileService, mockLogger);

    expect(betterAuthMockConfig).not.toBeNull();
    if (
      betterAuthMockConfig === null ||
      betterAuthMockConfig.emailAndPassword === undefined ||
      betterAuthMockConfig.databaseHooks?.user?.create?.after === undefined
    ) {
      throw new Error("betterAuthMockConfig is not fully populated");
    }

    expect(betterAuthMockConfig.baseURL).toBe("http://localhost:4000");
    expect(betterAuthMockConfig.emailAndPassword.disableSignUp).toBe(false);

    // Test database hook - success path
    const afterHook = betterAuthMockConfig.databaseHooks.user.create.after;
    await afterHook({ id: "user-1", name: "Harsh" });
    expect(mockUserProfileService.ensure).toHaveBeenCalledWith("user-1", "Harsh");

    // Test database hook - failure path
    mockUserProfileService.ensure.mockRejectedValueOnce(new Error("DB failure"));
    await afterHook({ id: "user-1", name: "Harsh" });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { error: expect.any(Error), userId: "user-1" },
      expect.stringContaining("failed")
    );
  });
});

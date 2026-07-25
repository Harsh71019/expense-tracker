import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture the configuration passed to betterAuth
let betterAuthMockConfig: {
  baseURL?: string;
  emailAndPassword?: {
    enabled: boolean;
    disableSignUp: boolean;
    minPasswordLength: number;
    maxPasswordLength: number;
    autoSignIn: boolean;
  };
  rateLimit?: {
    customRules?: Readonly<Record<string, Readonly<{ window: number; max: number }>>>;
  };
  plugins?: ReadonlyArray<{ id: string; options?: Record<string, unknown> }>;
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

vi.mock("@better-auth/api-key", () => {
  return {
    apiKey: vi.fn().mockImplementation((options) => ({ id: "api-key", options }))
  };
});

import { AuthService } from "../auth.service.js";
import { RuntimeConfigService } from "../../common/config/runtime-config.service.js";
import type { RuntimeEnv } from "../../common/config/env.js";

class MockRuntimeConfigService implements RuntimeConfigService {
  readonly env: RuntimeEnv;

  constructor(disableSignup = false) {
    this.env = {
      NODE_ENV: "test",
      API_PORT: 4000,
      LOG_LEVEL: "info",
      LOG_PRETTY: false,
      SERVICE_ROLE: "api",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
      APP_TIMEZONE: "Asia/Kolkata",
      TRUSTED_ORIGINS: "http://localhost:3000",
      GIT_SHA: "abcd-1234",
      BETTER_AUTH_SECRET: "test-secret-long-enough-32-chars-long",
      BETTER_AUTH_URL: "http://localhost:4000",
      AUTH_COOKIE_SECURE: false,
      DISABLE_SIGNUP: disableSignup,
      DISABLE_RATE_LIMITING: false
    };
  }

  trustedOrigins(): string[] {
    return ["http://localhost:3000"];
  }
}

describe("AuthService", () => {
  beforeEach(() => {
    betterAuthMockConfig = null;
  });

  it("instantiates betterAuth with configuration and hooks", async () => {
    const mockDb = {};

    const mockConfig = new MockRuntimeConfigService();
    const mockRedis = {};
    const mockUserProfileService = {
      ensure: vi.fn().mockResolvedValue(undefined)
    };
    const mockLogger = {
      warn: vi.fn()
    };

    // @ts-expect-error - mock dependencies for unit testing
    new AuthService(mockDb, mockConfig, mockRedis, mockUserProfileService, mockLogger);

    expect(betterAuthMockConfig).not.toBeNull();
    if (
      betterAuthMockConfig === null ||
      betterAuthMockConfig.emailAndPassword === undefined ||
      betterAuthMockConfig.databaseHooks?.user?.create?.after === undefined
    ) {
      throw new Error("betterAuthMockConfig is not fully populated");
    }

    expect(betterAuthMockConfig.baseURL).toBe("http://localhost:4000");
    expect(betterAuthMockConfig.emailAndPassword).toEqual({
      enabled: true,
      disableSignUp: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: false
    });
    expect(betterAuthMockConfig.rateLimit?.customRules?.["/sign-up/email"]).toEqual({
      window: 60,
      max: 10
    });

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

  it("passes the deployment signup switch to Better Auth", () => {
    const mockConfig = new MockRuntimeConfigService(true);

    // @ts-expect-error - mock dependencies for unit testing
    new AuthService({}, mockConfig, {}, { ensure: vi.fn() }, { warn: vi.fn() });

    expect(betterAuthMockConfig?.emailAndPassword?.disableSignUp).toBe(true);
  });

  it("registers the apiKey plugin with a user-scoped, database-backed, rate-limited config", async () => {
    const mockDb = {};
    const mockConfig = new MockRuntimeConfigService();
    const mockRedis = {};
    const mockUserProfileService = { ensure: vi.fn().mockResolvedValue(undefined) };
    const mockLogger = { warn: vi.fn() };

    // @ts-expect-error - mock dependencies for unit testing
    new AuthService(mockDb, mockConfig, mockRedis, mockUserProfileService, mockLogger);

    expect(betterAuthMockConfig).not.toBeNull();
    const plugins = betterAuthMockConfig?.plugins ?? [];
    const apiKeyPlugin = plugins.find((plugin) => plugin.id === "api-key");
    expect(apiKeyPlugin).toBeDefined();
    expect(apiKeyPlugin?.options).toMatchObject({
      references: "user",
      requireName: true,
      defaultPrefix: "ak_",
      rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 100 }
    });
  });
});

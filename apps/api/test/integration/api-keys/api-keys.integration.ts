import type { Logger } from "nestjs-pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiKeysService } from "../../../src/api-keys/api-keys.service.js";
import { AuthService } from "../../../src/auth/auth.service.js";
import type { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import type { RedisService } from "../../../src/common/redis/redis.service.js";
import type { UserProfileService } from "../../../src/user-profiles/user-profile.service.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

class TestRuntimeConfigService implements RuntimeConfigService {
  env = {
    NODE_ENV: "test" as const,
    API_PORT: 4000,
    LOG_LEVEL: "info" as const,
    SERVICE_ROLE: "api" as const,
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    APP_TIMEZONE: "Asia/Kolkata" as const,
    TRUSTED_ORIGINS: "http://localhost:3000",
    GIT_SHA: "test-sha",
    BETTER_AUTH_SECRET: "test-secret-long-enough-32-chars-long",
    BETTER_AUTH_URL: "http://localhost:4000",
    AUTH_COOKIE_SECURE: false,
    DISABLE_SIGNUP: false
  };

  trustedOrigins(): string[] {
    return ["http://localhost:3000"];
  }
}

describe("api-key plugin integration", () => {
  let testDb: TestDb;
  let authService: AuthService;
  let apiKeys: ApiKeysService;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    await insertTestUser(testDb.db, "user-b");

    // the api-key plugin defaults to database storage, never touches secondaryStorage
    // @ts-expect-error - mock RedisService for integration testing
    const redisMock: RedisService = {};
    // @ts-expect-error - mock UserProfileService for integration testing
    const profilesMock: UserProfileService = { ensure: async () => {} };
    // @ts-expect-error - mock Logger for integration testing
    const loggerMock: Logger = { warn: () => undefined };

    authService = new AuthService(
      testDb.db,
      new TestRuntimeConfigService(),
      redisMock,
      profilesMock,
      loggerMock
    );
    apiKeys = new ApiKeysService(authService);
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  it("round-trips create -> verify with matching permissions", async () => {
    const created = await apiKeys.create("user-a", {
      name: "n8n",
      permissions: { transactions: ["write"] }
    });

    const verified = await authService.auth.api.verifyApiKey({
      body: { key: created.key, permissions: { transactions: ["write"] } }
    });

    expect(verified.valid).toBe(true);
    expect(verified.key?.referenceId).toBe("user-a");
  });

  it("verifyApiKey's own permission check collapses insufficient-scope into KEY_NOT_FOUND, same as an invalid key -- this is why AuthGuard (Task 5) never passes permissions to verifyApiKey and compares scopes itself", async () => {
    const created = await apiKeys.create("user-a", {
      name: "read-only",
      permissions: { categories: ["read"] }
    });

    const verified = await authService.auth.api.verifyApiKey({
      body: { key: created.key, permissions: { transactions: ["write"] } }
    });

    expect(verified.valid).toBe(false);
    expect(verified.error?.code).toBe("KEY_NOT_FOUND");
  });

  it("a rate-limited key's verifyApiKey call returns RATE_LIMITED with a positive tryAgainIn", async () => {
    const created = await authService.auth.api.createApiKey({
      body: {
        userId: "user-a",
        name: "rate-limited",
        permissions: { accounts: ["read"] },
        prefix: "ak_",
        rateLimitEnabled: true,
        rateLimitMax: 1,
        rateLimitTimeWindow: 60_000
      }
    });

    const first = await authService.auth.api.verifyApiKey({ body: { key: created.key } });
    expect(first.valid).toBe(true);

    const second = await authService.auth.api.verifyApiKey({ body: { key: created.key } });
    expect(second.valid).toBe(false);
    expect(second.error?.code).toBe("RATE_LIMITED");
    expect(getTryAgainIn(second.error)).toBeGreaterThan(0);
  });

  it("a revoked (disabled) key fails verification", async () => {
    const created = await apiKeys.create("user-a", {
      name: "to-revoke",
      permissions: { accounts: ["read"] }
    });

    await apiKeys.revoke("user-a", created.id);

    const verified = await authService.auth.api.verifyApiKey({
      body: { key: created.key, permissions: { accounts: ["read"] } }
    });
    expect(verified.valid).toBe(false);
  });

  it("cannot update or revoke another user's key", async () => {
    const created = await apiKeys.create("user-a", {
      name: "user-a-key",
      permissions: { accounts: ["read"] }
    });

    await expect(apiKeys.update("user-b", created.id, { name: "hijacked" })).rejects.toThrow();
    await expect(apiKeys.revoke("user-b", created.id)).rejects.toThrow();

    const verified = await authService.auth.api.verifyApiKey({
      body: { key: created.key, permissions: { accounts: ["read"] } }
    });
    expect(verified.valid).toBe(true);
  });
});

// The installed @better-auth/api-key type declares verifyApiKey's error union without a
// `details` field on the RATE_LIMITED branch (it's typed as `{ code: string; cause?: unknown }`),
// but the plugin's runtime does attach `details: { tryAgainIn }` for that case (dist/index.mjs).
// Narrow via runtime checks on `unknown` rather than casting past the declared type.
function getTryAgainIn(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "details" in error &&
    typeof error.details === "object" &&
    error.details !== null &&
    "tryAgainIn" in error.details &&
    typeof error.details.tryAgainIn === "number"
  ) {
    return error.details.tryAgainIn;
  }
  return undefined;
}

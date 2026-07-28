import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { createAuth } from "../../../src/auth/auth.service.js";
import type { AuthSecondaryStorage } from "../../../src/auth/redis-secondary-storage.js";
import { account as credentialAccounts } from "../../../src/common/db/auth-schema.js";
import { session, user } from "../../../src/common/db/auth-schema.js";
import type { RuntimeEnv } from "../../../src/common/config/env.js";
import type { RuntimeConfigService } from "../../../src/common/config/runtime-config.service.js";
import { accounts, transactions } from "../../../src/common/db/schema/index.js";
import { UserProfileRepository } from "../../../src/user-profiles/user-profile.repository.js";
import { UserProfileService } from "../../../src/user-profiles/user-profile.service.js";
import { createTestDb } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const VALID_PASSWORD = "correct-horse-battery-staple";

class TestRuntimeConfigService implements RuntimeConfigService {
  readonly env: RuntimeEnv;

  constructor(disableSignup = false) {
    this.env = {
      NODE_ENV: "test",
      API_PORT: 4000,
      LOG_LEVEL: "info",
      LOG_PRETTY: false,
      SERVICE_ROLE: "api",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      DATABASE_POOL_MAX: 10,
      DATABASE_CONNECTION_TIMEOUT_MS: 5_000,
      DATABASE_QUERY_TIMEOUT_MS: 10_000,
      DATABASE_STATEMENT_TIMEOUT_MS: 10_000,
      DATABASE_LOCK_TIMEOUT_MS: 5_000,
      DATABASE_IDLE_IN_TXN_TIMEOUT_MS: 30_000,
      REDIS_URL: "redis://localhost:6379",
      READINESS_TIMEOUT_MS: 2_000,
      GRACEFUL_SHUTDOWN_TIMEOUT_MS: 15_000,
      APP_TIMEZONE: "Asia/Kolkata",
      TRUSTED_ORIGINS: "http://localhost:3000",
      GIT_SHA: "test-sha",
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

type StoredValue = Readonly<{ value: string; expiresAt: number | null }>;

class MemoryAuthSecondaryStorage implements AuthSecondaryStorage {
  private readonly values = new Map<string, StoredValue>();

  async get(key: string): Promise<string | null> {
    const stored = this.values.get(key);
    if (stored === undefined) {
      return null;
    }
    if (stored.expiresAt !== null && stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return stored.value;
  }

  async getAndDelete(key: string): Promise<string | null> {
    const value = await this.get(key);
    this.values.delete(key);
    return value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.values.set(key, {
      value,
      expiresAt: ttlSeconds === undefined ? null : Date.now() + ttlSeconds * 1000
    });
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const currentValue = await this.get(key);
    const nextValue = Number.parseInt(currentValue ?? "0", 10) + 1;
    await this.set(key, String(nextValue), ttlSeconds);
    return nextValue;
  }
}

describe("email/password registration", () => {
  let testDb: TestDb;
  let profiles: UserProfileService;

  beforeAll(async () => {
    testDb = await createTestDb();
    profiles = new UserProfileService(new UserProfileRepository(testDb.db));
  }, 60_000);

  afterEach(async () => {
    await assertInvariants(testDb, profiles);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  function buildAuth(disableSignup = false): ReturnType<typeof createAuth> {
    return createAuth(
      testDb.db,
      new TestRuntimeConfigService(disableSignup),
      new MemoryAuthSecondaryStorage(),
      profiles,
      { warn: vi.fn() }
    );
  }

  it("creates one normalized credential identity and profile without a session", async () => {
    const auth = buildAuth();
    const result = await auth.api.signUpEmail({
      body: {
        name: "Harsh",
        email: "New.User@Example.COM",
        password: VALID_PASSWORD,
        rememberMe: false
      }
    });

    expect(result.token).toBeNull();
    expect(result.user.email).toBe("new.user@example.com");

    const [createdUser] = await testDb.db
      .select()
      .from(user)
      .where(eq(user.email, "new.user@example.com"));
    if (createdUser === undefined) {
      throw new Error("Registered user was not persisted");
    }

    const savedCredentials = await testDb.db
      .select()
      .from(credentialAccounts)
      .where(
        and(
          eq(credentialAccounts.userId, createdUser.id),
          eq(credentialAccounts.providerId, "credential")
        )
      );
    expect(savedCredentials).toHaveLength(1);
    expect(savedCredentials[0]?.password).not.toBe(VALID_PASSWORD);
    expect(savedCredentials[0]?.password).not.toBeNull();

    expect(await profiles.get(createdUser.id)).toMatchObject({
      userId: createdUser.id,
      displayName: "Harsh"
    });

    const savedSessions = await testDb.db
      .select()
      .from(session)
      .where(eq(session.userId, createdUser.id));
    expect(savedSessions).toHaveLength(0);

    const duplicate = await auth.api.signUpEmail({
      body: {
        name: "Different display name",
        email: "new.user@example.com",
        password: "different-valid-password",
        rememberMe: false
      }
    });
    expect(duplicate.token).toBeNull();

    const matchingUsers = await testDb.db
      .select()
      .from(user)
      .where(eq(user.email, "new.user@example.com"));
    expect(matchingUsers).toHaveLength(1);
    const matchingCredentials = await testDb.db
      .select()
      .from(credentialAccounts)
      .where(eq(credentialAccounts.userId, createdUser.id));
    expect(matchingCredentials).toHaveLength(1);
  });

  it("rejects passwords outside the configured range without partial users", async () => {
    const auth = buildAuth();

    await expect(
      auth.api.signUpEmail({
        body: {
          name: "Short Password",
          email: "short-password@example.com",
          password: "1234567"
        }
      })
    ).rejects.toThrow();
    await expect(
      auth.api.signUpEmail({
        body: {
          name: "Long Password",
          email: "long-password@example.com",
          password: "x".repeat(129)
        }
      })
    ).rejects.toThrow();

    const shortPasswordUsers = await testDb.db
      .select()
      .from(user)
      .where(eq(user.email, "short-password@example.com"));
    const longPasswordUsers = await testDb.db
      .select()
      .from(user)
      .where(eq(user.email, "long-password@example.com"));
    expect(shortPasswordUsers).toHaveLength(0);
    expect(longPasswordUsers).toHaveLength(0);
  });

  it("rejects registration when the deployment switch disables signup", async () => {
    const auth = buildAuth(true);

    await expect(
      auth.api.signUpEmail({
        body: {
          name: "Disabled Registration",
          email: "disabled@example.com",
          password: VALID_PASSWORD
        }
      })
    ).rejects.toThrow();

    const matchingUsers = await testDb.db
      .select()
      .from(user)
      .where(eq(user.email, "disabled@example.com"));
    expect(matchingUsers).toHaveLength(0);
  });

  it("allows exactly one identity effect across five parallel attempts", async () => {
    const auth = buildAuth();
    const attempts = Array.from({ length: 5 }, () =>
      auth.api.signUpEmail({
        body: {
          name: "Parallel User",
          email: "parallel@example.com",
          password: VALID_PASSWORD,
          rememberMe: false
        }
      })
    );

    const results = await Promise.allSettled(attempts);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);

    const matchingUsers = await testDb.db
      .select()
      .from(user)
      .where(eq(user.email, "parallel@example.com"));
    expect(matchingUsers).toHaveLength(1);
    const [createdUser] = matchingUsers;
    if (createdUser === undefined) {
      throw new Error("Parallel registration did not persist a user");
    }

    const matchingCredentials = await testDb.db
      .select()
      .from(credentialAccounts)
      .where(
        and(
          eq(credentialAccounts.userId, createdUser.id),
          eq(credentialAccounts.providerId, "credential")
        )
      );
    expect(matchingCredentials).toHaveLength(1);
  });
});

async function assertInvariants(testDb: TestDb, profiles: UserProfileService): Promise<void> {
  const ledgerAccounts = await testDb.db.select({ id: accounts.id }).from(accounts);
  const ledgerTransactions = await testDb.db.select({ id: transactions.id }).from(transactions);
  expect(ledgerAccounts).toHaveLength(0);
  expect(ledgerTransactions).toHaveLength(0);

  const registeredUsers = await testDb.db.select({ id: user.id }).from(user);
  for (const registeredUser of registeredUsers) {
    const savedCredentials = await testDb.db
      .select({ id: credentialAccounts.id })
      .from(credentialAccounts)
      .where(
        and(
          eq(credentialAccounts.userId, registeredUser.id),
          eq(credentialAccounts.providerId, "credential")
        )
      );
    expect(savedCredentials).toHaveLength(1);
    expect(await profiles.get(registeredUser.id)).toMatchObject({ userId: registeredUser.id });
  }
}

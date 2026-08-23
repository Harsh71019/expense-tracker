import { describe, expect, it } from "vitest";

import { parseRuntimeEnv } from "../env.js";

describe("parseRuntimeEnv", () => {
  it("applies safe defaults to a valid environment", () => {
    const environment = parseRuntimeEnv({
      DATABASE_URL: "postgres://test:test@localhost:5432/treasury-ops",
      REDIS_URL: "redis://localhost:6379",
      TRUSTED_ORIGINS: "http://localhost:3000",
      BETTER_AUTH_SECRET: "a-very-long-test-secret-that-is-safe",
      BETTER_AUTH_URL: "http://localhost:4000"
    });

    expect(environment.API_PORT).toBe(4000);
    expect(environment.APP_TIMEZONE).toBe("Asia/Kolkata");
    expect(environment.AUTH_COOKIE_SECURE).toBe(false);
    expect(environment.DATABASE_POOL_MAX).toBe(10);
    expect(environment.DATABASE_CONNECTION_TIMEOUT_MS).toBe(5_000);
    expect(environment.DATABASE_QUERY_TIMEOUT_MS).toBe(10_000);
    expect(environment.DATABASE_STATEMENT_TIMEOUT_MS).toBe(10_000);
    expect(environment.DATABASE_LOCK_TIMEOUT_MS).toBe(5_000);
    expect(environment.DATABASE_IDLE_IN_TXN_TIMEOUT_MS).toBe(30_000);
    expect(environment.READINESS_TIMEOUT_MS).toBe(2_000);
    expect(environment.GRACEFUL_SHUTDOWN_TIMEOUT_MS).toBe(15_000);
    expect(environment.LOG_LEVEL).toBe("info");
    expect(environment.SEQ_URL).toBeUndefined();
    expect(environment.SEQ_API_KEY).toBeUndefined();
  });

  it("rejects a malformed SEQ_URL", () => {
    expect(() =>
      parseRuntimeEnv({
        DATABASE_URL: "postgres://test:test@localhost:5432/treasury-ops",
        REDIS_URL: "redis://localhost:6379",
        TRUSTED_ORIGINS: "http://localhost:3000",
        BETTER_AUTH_SECRET: "a-very-long-test-secret-that-is-safe",
        BETTER_AUTH_URL: "http://localhost:4000",
        SEQ_URL: "not-a-url"
      })
    ).toThrow();
  });

  it("rejects an incomplete environment", () => {
    expect(() => parseRuntimeEnv({})).toThrow();
  });

  it("rejects ambiguous boolean values", () => {
    expect(() =>
      parseRuntimeEnv({
        DATABASE_URL: "postgres://test:test@localhost:5432/treasury-ops",
        REDIS_URL: "redis://localhost:6379",
        TRUSTED_ORIGINS: "http://localhost:3000",
        BETTER_AUTH_SECRET: "a-very-long-test-secret-that-is-safe",
        BETTER_AUTH_URL: "http://localhost:4000",
        AUTH_COOKIE_SECURE: "yes"
      })
    ).toThrow();
  });

  it("rejects unsafe dependency timeout and pool settings", () => {
    const base = {
      DATABASE_URL: "postgres://test:test@localhost:5432/treasury-ops",
      REDIS_URL: "redis://localhost:6379",
      TRUSTED_ORIGINS: "http://localhost:3000",
      BETTER_AUTH_SECRET: "a-very-long-test-secret-that-is-safe",
      BETTER_AUTH_URL: "http://localhost:4000"
    };

    expect(() => parseRuntimeEnv({ ...base, DATABASE_POOL_MAX: "0" })).toThrow();
    expect(() => parseRuntimeEnv({ ...base, READINESS_TIMEOUT_MS: "50" })).toThrow();
  });
});

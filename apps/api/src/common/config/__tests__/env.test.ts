import { describe, expect, it } from "vitest";

import { parseRuntimeEnv } from "../env.js";

describe("parseRuntimeEnv", () => {
  it("applies safe defaults to a valid environment", () => {
    const environment = parseRuntimeEnv({
      MONGODB_URI: "mongodb://localhost:27017/vyaya",
      DATABASE_URL: "postgres://test:test@localhost:5432/vyaya",
      REDIS_URL: "redis://localhost:6379",
      TRUSTED_ORIGINS: "http://localhost:3000",
      BETTER_AUTH_SECRET: "a-very-long-test-secret-that-is-safe",
      BETTER_AUTH_URL: "http://localhost:4000"
    });

    expect(environment.API_PORT).toBe(4000);
    expect(environment.APP_TIMEZONE).toBe("Asia/Kolkata");
    expect(environment.AUTH_COOKIE_SECURE).toBe(false);
  });

  it("rejects an incomplete environment", () => {
    expect(() => parseRuntimeEnv({})).toThrow();
  });

  it("rejects ambiguous boolean values", () => {
    expect(() =>
      parseRuntimeEnv({
        MONGODB_URI: "mongodb://localhost:27017/vyaya",
        REDIS_URL: "redis://localhost:6379",
        TRUSTED_ORIGINS: "http://localhost:3000",
        BETTER_AUTH_SECRET: "a-very-long-test-secret-that-is-safe",
        BETTER_AUTH_URL: "http://localhost:4000",
        AUTH_COOKIE_SECURE: "yes"
      })
    ).toThrow();
  });
});

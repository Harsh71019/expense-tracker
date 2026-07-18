import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RuntimeConfigService } from "../runtime-config.service.js";

describe("RuntimeConfigService", () => {
  let envBackup: Record<string, string | undefined>;

  beforeEach(() => {
    envBackup = { ...process.env };
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("parses process.env correctly and splits trusted origins", () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/vyaya";
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/vyaya";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000, https://vyaya.app";
    process.env.BETTER_AUTH_SECRET = "a-very-long-test-secret-that-is-safe";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    const service = new RuntimeConfigService();

    expect(service.env.MONGODB_URI).toBe("mongodb://localhost:27017/vyaya");
    expect(service.env.API_PORT).toBe(4000);
    expect(service.trustedOrigins()).toEqual(["http://localhost:3000", "https://vyaya.app"]);
  });
});

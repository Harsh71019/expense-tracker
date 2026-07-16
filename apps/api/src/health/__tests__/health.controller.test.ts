import { describe, expect, it, vi } from "vitest";
import { HealthController } from "../health.controller.js";
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

describe("HealthController", () => {
  it("returns running Git SHA from healthz endpoint", () => {
    const mockConfig = new MockRuntimeConfigService();

    // @ts-expect-error - mock HealthService for controller tests
    const controller = new HealthController(mockConfig, {});
    const result = controller.healthz();

    expect(result).toEqual({
      status: "ok",
      sha: "abcd-1234"
    });
  });

  it("delegates readiness ping to healthService", async () => {
    const mockConfig = new MockRuntimeConfigService();

    const mockHealthService = {
      readiness: vi.fn().mockResolvedValue({ status: "ok", mongo: "ok", redis: "ok" })
    };

    // @ts-expect-error - mock HealthService for controller tests
    const controller = new HealthController(mockConfig, mockHealthService);
    const result = await controller.readyz();

    expect(result).toEqual({ status: "ok", mongo: "ok", redis: "ok" });
    expect(mockHealthService.readiness).toHaveBeenCalled();
  });
});

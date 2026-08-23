import { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { parseRuntimeEnv } from "../../config/env.js";
import type { RuntimeConfigService } from "../../config/runtime-config.service.js";
import { DatabaseClient } from "../database-client.service.js";

function createConfig(): RuntimeConfigService {
  return {
    env: parseRuntimeEnv({
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
      TRUSTED_ORIGINS: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-long-enough-32-chars-long",
      BETTER_AUTH_URL: "http://localhost:4000",
      PORTFOLIO_IMPORT_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64")
    }),
    trustedOrigins: () => ["http://localhost:3000"]
  };
}

describe("DatabaseClient", () => {
  it("closes its owned PostgreSQL pool during module shutdown", async () => {
    const end = vi.spyOn(Pool.prototype, "end").mockResolvedValue();
    const client = new DatabaseClient(createConfig());

    await client.onModuleDestroy();

    expect(end).toHaveBeenCalledOnce();
    end.mockRestore();
  });
});

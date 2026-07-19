import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DependencyUnavailableError } from "../common/errors/dependency-unavailable.error.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { RedisService } from "../common/redis/redis.service.js";

export type ReadinessResponse = Readonly<{
  status: "ok";
  postgres: "ok";
  redis: "ok";
}>;

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly redis: RedisService
  ) {}

  async readiness(): Promise<ReadinessResponse> {
    try {
      await Promise.all([this.db.execute(sql`select 1`), this.redis.ping()]);
    } catch {
      throw new DependencyUnavailableError("Dependencies are not ready.");
    }

    return { status: "ok", postgres: "ok", redis: "ok" };
  }
}

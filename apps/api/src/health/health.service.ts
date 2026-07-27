import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DependencyUnavailableError } from "../common/errors/dependency-unavailable.error.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withDeadline } from "../common/process/deadline.js";
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
    private readonly redis: RedisService,
    private readonly config: RuntimeConfigService
  ) {}

  async readiness(): Promise<ReadinessResponse> {
    const timeoutMs = this.config.env.READINESS_TIMEOUT_MS;
    const [postgres, redis] = await Promise.allSettled([
      withDeadline("PostgreSQL readiness check", timeoutMs, this.db.execute(sql`select 1`)),
      withDeadline("Redis readiness check", timeoutMs, this.redis.ping())
    ]);
    const unavailable: string[] = [];
    if (postgres.status === "rejected") unavailable.push("PostgreSQL");
    if (redis.status === "rejected" || !redis.value) unavailable.push("Redis");
    if (unavailable.length > 0) {
      throw new DependencyUnavailableError(`${unavailable.join(" and ")} not ready.`);
    }

    return { status: "ok", postgres: "ok", redis: "ok" };
  }
}

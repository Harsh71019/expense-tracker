import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";

import { DependencyUnavailableError } from "../common/errors/dependency-unavailable.error.js";
import { RedisService } from "../common/redis/redis.service.js";

export type ReadinessResponse = Readonly<{
  status: "ok";
  mongo: "ok";
  redis: "ok";
}>;

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redis: RedisService
  ) {}

  async readiness(): Promise<ReadinessResponse> {
    if (this.connection.db === undefined) {
      throw new DependencyUnavailableError("MongoDB is not connected.");
    }

    try {
      await Promise.all([this.connection.db.admin().ping(), this.redis.ping()]);
    } catch {
      throw new DependencyUnavailableError("Dependencies are not ready.");
    }

    return { status: "ok", mongo: "ok", redis: "ok" };
  }
}

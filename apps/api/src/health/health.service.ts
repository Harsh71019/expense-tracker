import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";

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
      throw new ServiceUnavailableException("MongoDB is not connected.");
    }

    try {
      await Promise.all([this.connection.db.admin().ping(), this.redis.ping()]);
    } catch {
      throw new ServiceUnavailableException("Dependencies are not ready.");
    }

    return { status: "ok", mongo: "ok", redis: "ok" };
  }
}

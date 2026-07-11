import { Controller, Get } from "@nestjs/common";

import { Public } from "../auth/public.decorator.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { HealthService, type ReadinessResponse } from "./health.service.js";

export type HealthResponse = Readonly<{
  status: "ok";
  sha: string;
}>;

@Controller()
@Public()
export class HealthController {
  constructor(
    private readonly config: RuntimeConfigService,
    private readonly healthService: HealthService
  ) {}

  @Get("healthz")
  healthz(): HealthResponse {
    return {
      status: "ok",
      sha: this.config.env.GIT_SHA
    };
  }

  @Get("readyz")
  async readyz(): Promise<ReadinessResponse> {
    return this.healthService.readiness();
  }
}

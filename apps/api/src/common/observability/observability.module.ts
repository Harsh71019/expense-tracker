import { Global, Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";

import { HttpMetricsMiddleware } from "./http-metrics.middleware.js";
import { MetricsService } from "./metrics.service.js";
import { NtfyOpsNotifierService } from "./ntfy-ops-notifier.service.js";

@Global()
@Module({
  providers: [HttpMetricsMiddleware, MetricsService, NtfyOpsNotifierService],
  exports: [MetricsService, NtfyOpsNotifierService]
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes("*");
  }
}

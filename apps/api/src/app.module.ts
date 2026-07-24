import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import type { ExecutionContext } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import pino from "pino";
import type { Request } from "express";

import { BalancesModule } from "./balances/balances.module.js";
import { RuntimeConfigModule } from "./common/config/runtime-config.module.js";
import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { DbModule } from "./common/db/db.module.js";
import { LoggingContextService } from "./common/logging/logging-context.service.js";
import { LoggingModule } from "./common/logging/logging.module.js";
import { IdempotencyModule } from "./common/idempotency/idempotency.module.js";
import { RedisModule } from "./common/redis/redis.module.js";
import { RedisService } from "./common/redis/redis.service.js";
import { RedisThrottlerStorage } from "./common/throttler/redis-throttler.storage.js";
import { AuthModule } from "./auth/auth.module.js";
import { AccountsModule } from "./accounts/accounts.module.js";
import { ApiKeysModule } from "./api-keys/api-keys.module.js";
import { AssetsModule } from "./assets/assets.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { CategoriesModule } from "./categories/categories.module.js";
import { CategoryRulesModule } from "./category-rules/category-rules.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { ExportModule } from "./export/export.module.js";
import { HealthModule } from "./health/health.module.js";
import { ImportsModule } from "./imports/imports.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { OpenApiModule } from "./openapi/openapi.module.js";
import { RecurringModule } from "./recurring/recurring.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { UserProfilesModule } from "./user-profiles/user-profiles.module.js";
import { TransactionsModule } from "./transactions/transactions.module.js";

const UNTHROTTLED_PATHS = new Set(["/api/healthz", "/api/readyz"]);

function isUnthrottledRequest(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest<Request>();
  return UNTHROTTLED_PATHS.has(request.path);
}

@Module({
  imports: [
    RuntimeConfigModule,
    DbModule,
    RedisModule,
    IdempotencyModule,
    BalancesModule,
    LoggingModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        skipIf: isUnthrottledRequest,
        storage: new RedisThrottlerStorage(redis),
        throttlers: [{ ttl: 60_000, limit: 300, blockDuration: 60_000 }]
      })
    }),
    NotificationsModule,
    UserProfilesModule,
    AuthModule,
    AccountsModule,
    ApiKeysModule,
    CategoriesModule,
    CategoryRulesModule,
    AuditModule,
    TransactionsModule,
    AssetsModule,
    ImportsModule,
    ExportModule,
    RecurringModule,
    ReportsModule,
    DashboardModule,
    OpenApiModule,
    LoggerModule.forRootAsync({
      inject: [RuntimeConfigService, LoggingContextService],
      useFactory: (config: RuntimeConfigService, context: LoggingContextService) => ({
        pinoHttp: {
          level: config.env.LOG_LEVEL,
          base: { service: config.env.SERVICE_ROLE, sha: config.env.GIT_SHA },
          timestamp: pino.stdTimeFunctions.isoTime,
          formatters: { level: (label) => ({ level: label }) },
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "req.body.password",
              "*.password",
              "*.secret",
              "*.token"
            ],
            censor: "[REDACTED]"
          },
          autoLogging: {
            ignore: (request) => request.url === "/api/healthz" || request.url === "/api/readyz"
          },
          mixin: () => context.get() ?? {},
          genReqId: (request, response) => {
            const requestId = request.headers["x-request-id"];
            const id = typeof requestId === "string" ? requestId : crypto.randomUUID();
            response.setHeader("x-request-id", id);
            return id;
          }
        }
      })
    }),
    HealthModule
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
})
export class AppModule {}

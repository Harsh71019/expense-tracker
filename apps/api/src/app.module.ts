import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { LoggerModule } from "nestjs-pino";
import pino from "pino";

import { BalancesModule } from "./balances/balances.module.js";
import { RuntimeConfigModule } from "./common/config/runtime-config.module.js";
import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { LoggingContextService } from "./common/logging/logging-context.service.js";
import { LoggingModule } from "./common/logging/logging.module.js";
import { IdempotencyModule } from "./common/idempotency/idempotency.module.js";
import { RedisModule } from "./common/redis/redis.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AccountsModule } from "./accounts/accounts.module.js";
import { AssetsModule } from "./assets/assets.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { CategoriesModule } from "./categories/categories.module.js";
import { CategoryRulesModule } from "./category-rules/category-rules.module.js";
import { ExportModule } from "./export/export.module.js";
import { HealthModule } from "./health/health.module.js";
import { ImportsModule } from "./imports/imports.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { RecurringModule } from "./recurring/recurring.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { UserProfilesModule } from "./user-profiles/user-profiles.module.js";
import { TransactionsModule } from "./transactions/transactions.module.js";

@Module({
  imports: [
    RuntimeConfigModule,
    MongooseModule.forRootAsync({
      inject: [RuntimeConfigService],
      useFactory: (config: RuntimeConfigService) => ({
        uri: config.env.MONGODB_URI,
        maxPoolSize: 10,
        monitorCommands: true,
        serverSelectionTimeoutMS: 5_000
      })
    }),
    RedisModule,
    IdempotencyModule,
    BalancesModule,
    LoggingModule,
    ScheduleModule.forRoot(),
    NotificationsModule,
    UserProfilesModule,
    AuthModule,
    AccountsModule,
    CategoriesModule,
    CategoryRulesModule,
    AuditModule,
    TransactionsModule,
    AssetsModule,
    ImportsModule,
    ExportModule,
    RecurringModule,
    ReportsModule,
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
              "*.token",
              "*.mongoUri"
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
  ]
})
export class AppModule {}

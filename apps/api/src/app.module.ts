import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { LoggerModule } from "nestjs-pino";

import { RuntimeConfigModule } from "./common/config/runtime-config.module.js";
import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { RedisModule } from "./common/redis/redis.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AccountsModule } from "./accounts/accounts.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { CategoriesModule } from "./categories/categories.module.js";
import { HealthModule } from "./health/health.module.js";
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
        serverSelectionTimeoutMS: 5_000
      })
    }),
    RedisModule,
    UserProfilesModule,
    AuthModule,
    AccountsModule,
    CategoriesModule,
    AuditModule,
    TransactionsModule,
    LoggerModule.forRoot({
      pinoHttp: {
        redact: ["req.headers.authorization", "req.headers.cookie"],
        genReqId: (request) => {
          const requestId = request.headers["x-request-id"];
          return typeof requestId === "string" ? requestId : crypto.randomUUID();
        }
      }
    }),
    HealthModule
  ]
})
export class AppModule {}

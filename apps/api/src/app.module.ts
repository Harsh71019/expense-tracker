import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { LoggerModule } from "nestjs-pino";

import { RuntimeConfigModule } from "./common/config/runtime-config.module.js";
import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { RedisModule } from "./common/redis/redis.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { HealthModule } from "./health/health.module.js";

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
    AuthModule,
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

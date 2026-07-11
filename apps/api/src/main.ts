import "reflect-metadata";

import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { Logger } from "nestjs-pino";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { ProblemJsonFilter } from "./common/errors/problem-json.filter.js";
import { AuthService } from "./auth/auth.service.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  app.useLogger(app.get(Logger));
  const config = app.get(RuntimeConfigService);
  const auth = app.get(AuthService);
  app.getHttpAdapter().getInstance().all("/api/auth/{*any}", toNodeHandler(auth.auth));
  app.enableShutdownHooks();
  app.useGlobalFilters(new ProblemJsonFilter());
  app.setGlobalPrefix("api");
  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json());
  app.enableCors({
    origin: config.trustedOrigins(),
    credentials: true
  });
  await app.listen(config.env.API_PORT, "0.0.0.0");
}

void bootstrap();

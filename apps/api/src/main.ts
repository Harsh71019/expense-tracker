import "reflect-metadata";

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
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
import { requireSession } from "./auth/require-session.middleware.js";
import { ImportsQueue } from "./imports/imports.queue.js";

const BULL_BOARD_BASE_PATH = "/api/admin/queues";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  app.useLogger(app.get(Logger));
  const config = app.get(RuntimeConfigService);
  const auth = app.get(AuthService);
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.all("/api/auth/*any", toNodeHandler(auth.auth));

  // Mounted before helmet() so Bull Board's own UI assets (inline
  // scripts/styles) aren't blocked by the API's default CSP — same
  // before-helmet placement Better Auth's handler above already uses.
  // requireSession stands in for AuthGuard here since this router isn't a
  // Nest controller, so Nest's guard pipeline never runs for it.
  const bullBoardServerAdapter = new ExpressAdapter();
  bullBoardServerAdapter.setBasePath(BULL_BOARD_BASE_PATH);
  createBullBoard({
    queues: [new BullMQAdapter(app.get(ImportsQueue).getQueue())],
    serverAdapter: bullBoardServerAdapter
  });
  httpAdapter.use(BULL_BOARD_BASE_PATH, requireSession(auth), bullBoardServerAdapter.getRouter());

  app.enableShutdownHooks();
  app.useGlobalFilters(new ProblemJsonFilter(app.get(Logger)));
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

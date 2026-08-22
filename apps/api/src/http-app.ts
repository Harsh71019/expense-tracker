import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module.js";
import { AuthService } from "./auth/auth.service.js";
import { requireSession } from "./auth/require-session.middleware.js";
import { BillStatementsQueue } from "./bills/bill-statements.queue.js";
import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { ProblemJsonFilter } from "./common/errors/problem-json.filter.js";
import { JSON_BODY_LIMIT_BYTES } from "./common/http/request-limits.js";
import { ImportsQueue } from "./imports/imports.queue.js";

const BULL_BOARD_BASE_PATH = "/api/admin/queues";

/**
 * Builds the production HTTP composition without binding a port. Keeping
 * middleware, Better Auth, Bull Board, filters, CORS, and global prefixes in
 * one factory lets e2e tests exercise the exact app that main.ts starts.
 */
export async function createHttpApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  app.useLogger(app.get(Logger));
  const config = app.get(RuntimeConfigService);
  const auth = app.get(AuthService);
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.set("trust proxy", 1);
  httpAdapter.all("/api/auth/*any", toNodeHandler(auth.auth));

  // Mounted before helmet() so Bull Board's own UI assets (inline
  // scripts/styles) aren't blocked by the API's default CSP.
  const bullBoardServerAdapter = new ExpressAdapter();
  bullBoardServerAdapter.setBasePath(BULL_BOARD_BASE_PATH);
  createBullBoard({
    queues: [
      new BullMQAdapter(app.get(ImportsQueue).getQueue()),
      new BullMQAdapter(app.get(BillStatementsQueue).getQueue())
    ],
    serverAdapter: bullBoardServerAdapter
  });
  httpAdapter.use(BULL_BOARD_BASE_PATH, requireSession(auth), bullBoardServerAdapter.getRouter());

  app.useGlobalFilters(new ProblemJsonFilter(app.get(Logger)));
  app.setGlobalPrefix("api");
  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: JSON_BODY_LIMIT_BYTES }));
  app.enableCors({
    origin: config.trustedOrigins(),
    credentials: true
  });
  return app;
}

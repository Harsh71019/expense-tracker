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
import pino from "pino";

import { AppModule } from "./app.module.js";
import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { ProblemJsonFilter } from "./common/errors/problem-json.filter.js";
import { AuthService } from "./auth/auth.service.js";
import { requireSession } from "./auth/require-session.middleware.js";
import { ImportsQueue } from "./imports/imports.queue.js";
import { withDeadline } from "./common/process/deadline.js";

const BULL_BOARD_BASE_PATH = "/api/admin/queues";

async function bootstrap(): Promise<void> {
  // node --watch restarts this process on every dist change during `pnpm dev`;
  // clear the terminal on each restart so it doesn't accumulate scrollback all day.
  // Gated on LOG_PRETTY (not NODE_ENV — AGENTS.md bans NODE_ENV branches in business
  // code, and .env.development.local deliberately pins NODE_ENV=production anyway).
  if (process.env.LOG_PRETTY === "true" || process.env.LOG_PRETTY === "1") {
    // eslint-disable-next-line no-console -- clearing the terminal, not logging
    console.clear();
  }
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

  let isShuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    const logger = app.get(Logger);
    logger.log({ event: "api.stopping", signal }, "api process stopping");
    try {
      await withDeadline(
        "API graceful shutdown",
        config.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
        app.close()
      );
      logger.log({ event: "api.stopped", signal }, "api process stopped");
    } catch (error: unknown) {
      logger.fatal({ event: "api.shutdown_failed", signal, err: error }, "api shutdown failed");
      process.exit(1);
    }
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrap().catch((error: unknown) => {
  pino({ level: process.env.LOG_LEVEL ?? "error" }).fatal(
    { event: "api.bootstrap_failed", err: error },
    "api bootstrap failed"
  );
  process.exitCode = 1;
});

import "reflect-metadata";

import { Logger } from "nestjs-pino";
import pino from "pino";

import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { LogEvent } from "./common/logging/events.js";
import { NtfyOpsNotifierService } from "./common/observability/ntfy-ops-notifier.service.js";
import { withDeadline } from "./common/process/deadline.js";
import { createHttpApp } from "./http-app.js";

async function bootstrap(): Promise<void> {
  // node --watch restarts this process on every dist change during `pnpm dev`;
  // clear the terminal on each restart so it doesn't accumulate scrollback all day.
  // Gated on LOG_PRETTY (not NODE_ENV — AGENTS.md bans NODE_ENV branches in business
  // code, and .env.development.local deliberately pins NODE_ENV=production anyway).
  if (process.env.LOG_PRETTY === "true" || process.env.LOG_PRETTY === "1") {
    // eslint-disable-next-line no-console -- clearing the terminal, not logging
    console.clear();
  }
  const app = await createHttpApp();
  const config = app.get(RuntimeConfigService);
  await app.listen(config.env.API_PORT, "0.0.0.0");

  const logger = app.get(Logger);
  logger.log({ event: LogEvent.ApiStarted, sha: config.env.GIT_SHA }, "api process started");
  await app.get(NtfyOpsNotifierService).notify({
    title: "🔄 TreasuryOps api started",
    message: `sha=${config.env.GIT_SHA}`,
    tags: ["arrows_counterclockwise"]
  });

  let isShuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.log({ event: "api.stopping", signal }, "api process stopping");
    try {
      await withDeadline(
        "API graceful shutdown",
        config.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
        app.close()
      );
      logger.log({ event: "api.stopped", signal }, "api process stopped");
      // pino's pretty-print transport (LOG_PRETTY) runs in a worker thread that
      // isn't tied to Nest's lifecycle, so the event loop never drains on its own.
      process.exit(0);
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

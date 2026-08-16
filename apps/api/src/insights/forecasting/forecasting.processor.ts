import type { Job } from "bullmq";
import { Worker } from "bullmq";
import type { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../../common/config/runtime-config.service.js";
import { createQueueConnection } from "../../common/queue/queue-connection.js";
import {
  COMPUTE_CASHFLOW_FORECAST_JOB_NAME,
  CASHFLOW_FORECAST_QUEUE_NAME,
  CashflowForecastJobDataSchema,
  type CashflowForecastJobData
} from "./forecasting.queue.js";
import { ForecastingService } from "./forecasting.service.js";
export function startForecastingWorker(
  config: RuntimeConfigService,
  service: ForecastingService,
  logger: Pick<Logger, "log" | "error">
): Worker<CashflowForecastJobData> {
  return new Worker(
    CASHFLOW_FORECAST_QUEUE_NAME,
    async (job: Job<CashflowForecastJobData>) => {
      const data = CashflowForecastJobDataSchema.parse(job.data);
      const snapshot = await service.computeUser(data.userId, new Date(data.asOf));
      logger.log(
        {
          event: "forecast.computed",
          model: snapshot.model,
          horizonDays: snapshot.horizonDays,
          rowsScanned: snapshot.resources.rowsScanned
        },
        "cash-flow forecast snapshot completed"
      );
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) =>
    logger.error(
      {
        event: "forecast.failed",
        jobName: job?.name ?? COMPUTE_CASHFLOW_FORECAST_JOB_NAME,
        err: error
      },
      "cash-flow forecast failed"
    )
  );
}

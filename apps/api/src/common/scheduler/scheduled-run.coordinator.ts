import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { Logger } from "nestjs-pino";

import { LogEvent } from "../logging/events.js";
import { toISTCalendarDate } from "../time/ist.js";
import { ScheduledRunRepository } from "./scheduled-run.repository.js";

export type ScheduleCadence = "daily" | "minute";

const DEFAULT_LEASE_MS = 60 * 60_000;

@Injectable()
export class ScheduledRunCoordinator {
  constructor(
    private readonly runs: ScheduledRunRepository,
    @Inject(Logger) private readonly logger: Pick<Logger, "log" | "error">
  ) {}

  async run(
    jobName: string,
    cadence: ScheduleCadence,
    task: () => Promise<number>,
    now: Date = new Date()
  ): Promise<boolean> {
    const scheduleWindow = toScheduleWindow(now, cadence);
    const id = `${jobName}:${scheduleWindow}`;
    const claimToken = randomUUID();
    const claimed = await this.runs.tryStart({
      id,
      jobName,
      scheduleWindow,
      scheduledFor: now,
      claimToken,
      leaseUntil: new Date(now.getTime() + DEFAULT_LEASE_MS),
      now
    });
    if (claimed === null) return false;

    const startedAt = performance.now();
    try {
      const itemCount = await task();
      const completedAt = new Date();
      const durationMs = Math.round(performance.now() - startedAt);
      if (!(await this.runs.complete(id, claimToken, completedAt, durationMs, itemCount))) {
        throw new Error("Scheduled run lease expired before completion.");
      }
      this.logger.log(
        {
          event: LogEvent.SchedulerRunCompleted,
          runId: id,
          jobName,
          durationMs,
          itemCount
        },
        "scheduled run completed"
      );
      return true;
    } catch (error) {
      const failedAt = new Date();
      const durationMs = Math.round(performance.now() - startedAt);
      await this.runs.fail(id, claimToken, failedAt, durationMs, errorSummary(error));
      this.logger.error(
        {
          event: LogEvent.SchedulerRunFailed,
          runId: id,
          jobName,
          durationMs,
          err: error
        },
        "scheduled run failed"
      );
      throw error;
    }
  }
}

export function toScheduleWindow(now: Date, cadence: ScheduleCadence): string {
  if (cadence === "daily") return toISTCalendarDate(now);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  const hour = values.get("hour");
  const minute = values.get("minute");
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new Error("Could not derive the IST scheduler window.");
  }
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function errorSummary(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown scheduled run failure";
}

export async function runScheduled(
  coordinator: ScheduledRunCoordinator | undefined,
  jobName: string,
  cadence: ScheduleCadence,
  task: () => Promise<number>
): Promise<void> {
  if (coordinator === undefined) {
    await task();
    return;
  }
  await coordinator.run(jobName, cadence, task);
}

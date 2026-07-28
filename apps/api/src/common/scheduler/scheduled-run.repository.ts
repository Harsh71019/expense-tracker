import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../db/db.module.js";
import type { DrizzleDb } from "../db/db.module.js";
import { scheduledJobRuns } from "../db/schema/index.js";
import { stripNulls } from "../db/strip-nulls.js";

const ScheduledRunSchema = z.object({
  id: z.string().min(1),
  jobName: z.string().min(1),
  scheduleWindow: z.string().min(1),
  scheduledFor: z.date(),
  status: z.enum(["running", "completed", "failed"]),
  claimToken: z.string().uuid().optional(),
  leaseUntil: z.date().optional(),
  attemptCount: z.number().int().positive(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  itemCount: z.number().int().nonnegative().optional(),
  failureSummary: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type ScheduledRun = z.infer<typeof ScheduledRunSchema>;

type StartRun = Readonly<{
  id: string;
  jobName: string;
  scheduleWindow: string;
  scheduledFor: Date;
  claimToken: string;
  leaseUntil: Date;
  now: Date;
}>;

@Injectable()
export class ScheduledRunRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async tryStart(input: StartRun): Promise<ScheduledRun | null> {
    const reclaimable = or(
      eq(scheduledJobRuns.status, "failed"),
      and(eq(scheduledJobRuns.status, "running"), lte(scheduledJobRuns.leaseUntil, input.now))
    );
    if (reclaimable === undefined) {
      throw new Error("Scheduled run reclaim predicate was not constructed.");
    }
    const [row] = await this.db
      .insert(scheduledJobRuns)
      .values({
        id: input.id,
        jobName: input.jobName,
        scheduleWindow: input.scheduleWindow,
        scheduledFor: input.scheduledFor,
        status: "running",
        claimToken: input.claimToken,
        leaseUntil: input.leaseUntil,
        attemptCount: 1,
        startedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now
      })
      .onConflictDoUpdate({
        target: scheduledJobRuns.id,
        set: {
          status: "running",
          claimToken: input.claimToken,
          leaseUntil: input.leaseUntil,
          attemptCount: sql`${scheduledJobRuns.attemptCount} + 1`,
          startedAt: input.now,
          completedAt: null,
          durationMs: null,
          itemCount: null,
          failureSummary: null,
          updatedAt: input.now
        },
        setWhere: reclaimable
      })
      .returning();
    return row === undefined ? null : toRun(row);
  }

  async complete(
    id: string,
    claimToken: string,
    completedAt: Date,
    durationMs: number,
    itemCount: number
  ): Promise<boolean> {
    const rows = await this.db
      .update(scheduledJobRuns)
      .set({
        status: "completed",
        claimToken: null,
        leaseUntil: null,
        completedAt,
        durationMs,
        itemCount,
        failureSummary: null,
        updatedAt: completedAt
      })
      .where(
        and(
          eq(scheduledJobRuns.id, id),
          eq(scheduledJobRuns.status, "running"),
          eq(scheduledJobRuns.claimToken, claimToken)
        )
      )
      .returning({ id: scheduledJobRuns.id });
    return rows.length === 1;
  }

  async fail(
    id: string,
    claimToken: string,
    failedAt: Date,
    durationMs: number,
    failureSummary: string
  ): Promise<void> {
    await this.db
      .update(scheduledJobRuns)
      .set({
        status: "failed",
        claimToken: null,
        leaseUntil: null,
        completedAt: failedAt,
        durationMs,
        failureSummary: failureSummary.slice(0, 500),
        updatedAt: failedAt
      })
      .where(
        and(
          eq(scheduledJobRuns.id, id),
          eq(scheduledJobRuns.status, "running"),
          eq(scheduledJobRuns.claimToken, claimToken)
        )
      );
  }

  async systemFailExpired(now: Date): Promise<ScheduledRun[]> {
    const rows = await this.db
      .update(scheduledJobRuns)
      .set({
        status: "failed",
        claimToken: null,
        leaseUntil: null,
        completedAt: now,
        failureSummary: "Scheduler lease expired before completion.",
        updatedAt: now
      })
      .where(and(eq(scheduledJobRuns.status, "running"), lte(scheduledJobRuns.leaseUntil, now)))
      .returning();
    return rows.map(toRun);
  }

  async systemLatestByJob(): Promise<ScheduledRun[]> {
    const rows = await this.db
      .selectDistinctOn([scheduledJobRuns.jobName])
      .from(scheduledJobRuns)
      .orderBy(asc(scheduledJobRuns.jobName), desc(scheduledJobRuns.scheduledFor));
    return rows.map(toRun);
  }

  async systemDeleteTerminalBefore(cutoff: Date): Promise<number> {
    const rows = await this.db
      .delete(scheduledJobRuns)
      .where(
        and(
          inArray(scheduledJobRuns.status, ["completed", "failed"]),
          lt(scheduledJobRuns.completedAt, cutoff)
        )
      )
      .returning({ id: scheduledJobRuns.id });
    return rows.length;
  }
}

function toRun(row: typeof scheduledJobRuns.$inferSelect): ScheduledRun {
  return ScheduledRunSchema.parse(stripNulls(row));
}

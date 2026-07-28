import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { scheduledRunStatusEnum } from "./enums.js";

export const scheduledJobRuns = pgTable(
  "scheduled_job_runs",
  {
    id: text("id").primaryKey(),
    jobName: text("job_name").notNull(),
    scheduleWindow: text("schedule_window").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: scheduledRunStatusEnum("status").notNull(),
    claimToken: uuid("claim_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    itemCount: integer("item_count"),
    failureSummary: text("failure_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("scheduled_job_runs_job_scheduled").on(table.jobName, table.scheduledFor),
    index("scheduled_job_runs_status_lease").on(table.status, table.leaseUntil)
  ]
);

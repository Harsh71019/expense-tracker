import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import {
  spendingChangeDirectionEnum,
  spendingChangeRunStatusEnum,
  spendingRegimeTypeEnum
} from "./enums.js";
import { detectedRecurringStreams } from "./detected-recurring-stream.js";
import { transactions } from "./transaction.js";

export const spendingRegimes = pgTable(
  "spending_regimes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    regimeType: spendingRegimeTypeEnum("regime_type").notNull(),
    baselineMedianMinor: bigint("baseline_median_minor", { mode: "number" }).notNull(),
    newMedianMinor: bigint("new_median_minor", { mode: "number" }).notNull(),
    deltaMinor: bigint("delta_minor", { mode: "number" }).notNull(),
    direction: spendingChangeDirectionEnum("direction").notNull(),
    confidenceBps: integer("confidence_bps").notNull(),
    sufficiency: jsonb("sufficiency").notNull(),
    changeDate: text("change_date").notNull(),
    occurredAtStart: timestamp("occurred_at_start", { withTimezone: true }).notNull(),
    occurredAtEnd: timestamp("occurred_at_end", { withTimezone: true }).notNull(),
    evidence: jsonb("evidence").notNull(),
    inputWatermark: jsonb("input_watermark").notNull(),
    supersedesRegimeId: uuid("supersedes_regime_id").references(
      (): AnyPgColumn => spendingRegimes.id
    ),
    detectorVersion: integer("detector_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("spending_regimes_user_computed").on(table.userId, table.computedAt.desc()),
    index("spending_regimes_user_type_computed").on(
      table.userId,
      table.regimeType,
      table.computedAt.desc()
    ),
    uniqueIndex("spending_regimes_user_date_type_version").on(
      table.userId,
      table.regimeType,
      table.changeDate,
      table.detectorVersion
    )
  ]
);

export const detectedRecurringStreamChanges = pgTable(
  "detected_recurring_stream_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    streamId: uuid("stream_id")
      .notNull()
      .references(() => detectedRecurringStreams.id),
    supersedesStreamId: uuid("supersedes_stream_id").references(() => detectedRecurringStreams.id),
    oldMedianMinor: bigint("old_median_minor", { mode: "number" }).notNull(),
    newMedianMinor: bigint("new_median_minor", { mode: "number" }).notNull(),
    deltaMinor: bigint("delta_minor", { mode: "number" }).notNull(),
    direction: spendingChangeDirectionEnum("direction").notNull(),
    confidenceBps: integer("confidence_bps").notNull(),
    changeOccurredAt: timestamp("change_occurred_at", { withTimezone: true }).notNull(),
    changeTransactionId: uuid("change_transaction_id")
      .notNull()
      .references(() => transactions.id),
    evidence: jsonb("evidence").notNull(),
    inputWatermark: jsonb("input_watermark").notNull(),
    detectorVersion: integer("detector_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("stream_changes_user_stream_version").on(
      table.userId,
      table.streamId,
      table.detectorVersion
    ),
    index("stream_changes_user_computed").on(table.userId, table.computedAt.desc()),
    index("stream_changes_stream_id").on(table.streamId)
  ]
);

export const spendingChangeDetectionRuns = pgTable(
  "spending_change_detection_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    detectorVersion: integer("detector_version").notNull(),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    inputDigest: text("input_digest").notNull(),
    inputWatermark: jsonb("input_watermark").notNull(),
    status: spendingChangeRunStatusEnum("status").notNull(),
    sufficiency: jsonb("sufficiency").notNull(),
    resources: jsonb("resources").notNull(),
    recurringChangesCount: integer("recurring_changes_count").notNull().default(0),
    regimesCount: integer("regimes_count").notNull().default(0),
    abstainedCount: integer("abstained_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: text("failure_code")
  },
  (table) => [
    uniqueIndex("spending_change_runs_user_version_asof_digest").on(
      table.userId,
      table.detectorVersion,
      table.asOf,
      table.inputDigest
    ),
    index("spending_change_runs_user_completed").on(table.userId, table.completedAt.desc()),
    index("spending_change_runs_status_started").on(table.status, table.startedAt)
  ]
);

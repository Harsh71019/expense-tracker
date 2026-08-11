import { sql } from "drizzle-orm";
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
  detectedStreamAmountBehaviorEnum,
  detectedStreamCadenceEnum,
  detectedStreamStateEnum,
  recurringDetectionRunStatusEnum,
  transactionTypeEnum
} from "./enums.js";
import { transactions } from "./transaction.js";

export const detectedRecurringStreams = pgTable(
  "detected_recurring_streams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    logicalKey: text("logical_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    detectorVersion: integer("detector_version").notNull(),
    transactionType: transactionTypeEnum("transaction_type").notNull(),
    counterpartyKey: text("counterparty_key"),
    cadence: detectedStreamCadenceEnum("cadence").notNull(),
    state: detectedStreamStateEnum("state").notNull(),
    amountBehavior: detectedStreamAmountBehaviorEnum("amount_behavior").notNull(),
    confidenceBps: integer("confidence_bps").notNull(),
    sufficiency: jsonb("sufficiency").notNull(),
    evidence: jsonb("evidence").notNull(),
    medianAmountMinor: bigint("median_amount_minor", { mode: "number" }).notNull(),
    madAmountMinor: bigint("mad_amount_minor", { mode: "number" }).notNull(),
    nextExpectedDate: text("next_expected_date"),
    inputWatermark: jsonb("input_watermark").notNull(),
    supersedesStreamId: uuid("supersedes_stream_id").references(
      (): AnyPgColumn => detectedRecurringStreams.id
    ),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("detected_streams_user_fingerprint_version").on(
      table.userId,
      table.fingerprint,
      table.detectorVersion
    ),
    index("detected_streams_user_logical_computed").on(
      table.userId,
      table.logicalKey,
      table.computedAt.desc()
    ),
    index("detected_streams_user_state_computed").on(
      table.userId,
      table.state,
      table.computedAt.desc()
    ),
    index("detected_streams_user_computed_id").on(table.userId, table.computedAt.desc(), table.id)
  ]
);

export const detectedRecurringStreamMembers = pgTable(
  "detected_recurring_stream_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    streamId: uuid("stream_id")
      .notNull()
      .references(() => detectedRecurringStreams.id),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    residualDays: integer("residual_days").notNull(),
    normalizerVersion: integer("normalizer_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("detected_stream_members_user_stream_txn").on(
      table.userId,
      table.streamId,
      table.transactionId
    ),
    index("detected_stream_members_user_txn").on(table.userId, table.transactionId),
    index("detected_stream_members_stream_id")
      .on(table.streamId)
      .where(sql`${table.streamId} IS NOT NULL`)
  ]
);

export const recurringDetectionRuns = pgTable(
  "recurring_detection_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    detectorVersion: integer("detector_version").notNull(),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    inputDigest: text("input_digest").notNull(),
    inputWatermark: jsonb("input_watermark").notNull(),
    status: recurringDetectionRunStatusEnum("status").notNull(),
    sufficiency: jsonb("sufficiency").notNull(),
    resources: jsonb("resources").notNull(),
    candidateCount: integer("candidate_count").notNull().default(0),
    matureCount: integer("mature_count").notNull().default(0),
    staleCount: integer("stale_count").notNull().default(0),
    abstainedGroupCount: integer("abstained_group_count").notNull().default(0),
    processedStreamCount: integer("processed_stream_count").notNull().default(0),
    totalStreamCount: integer("total_stream_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: text("failure_code")
  },
  (table) => [
    uniqueIndex("recurring_detection_runs_user_version_asof_digest").on(
      table.userId,
      table.detectorVersion,
      table.asOf,
      table.inputDigest
    ),
    index("recurring_detection_runs_user_completed").on(table.userId, table.completedAt.desc()),
    index("recurring_detection_runs_status_started").on(table.status, table.startedAt)
  ]
);

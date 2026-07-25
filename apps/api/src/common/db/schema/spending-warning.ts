import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { categories } from "./category.js";
import { transactions } from "./transaction.js";
import {
  spendingWarningAnalysisStateStatusEnum,
  spendingWarningKindEnum,
  spendingWarningSeverityEnum,
  spendingWarningStatusEnum
} from "./enums.js";

/**
 * One row per user (plan §5). `eligibleKinds` is a JSONB array of
 * SpendingWarningKind values, parsed through
 * SpendingWarningEligibleKindsSchema on the way out of the repository —
 * never trusted as-is. `status` here is worker-persisted only
 * (learning/ready); the API derives `stale`/`unavailable` from
 * `computedAt` at read time.
 */
export const spendingWarningAnalysisState = pgTable("spending_warning_analysis_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id),
  detectorVersion: bigint("detector_version", { mode: "number" }).notNull(),
  status: spendingWarningAnalysisStateStatusEnum("status").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
  sourceThrough: timestamp("source_through", { withTimezone: true }).notNull(),
  historyStart: timestamp("history_start", { withTimezone: true }),
  baselineExpenseCount: bigint("baseline_expense_count", { mode: "number" }).notNull(),
  eligibleKinds: jsonb("eligible_kinds").notNull()
});

export const spendingWarnings = pgTable(
  "spending_warnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    fingerprint: text("fingerprint").notNull(),
    kind: spendingWarningKindEnum("kind").notNull(),
    severity: spendingWarningSeverityEnum("severity").notNull(),
    status: spendingWarningStatusEnum("status").notNull(),
    categoryId: uuid("category_id").references(() => categories.id),
    transactionId: uuid("transaction_id").references(() => transactions.id),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    evidence: jsonb("evidence").notNull(),
    detectorVersion: bigint("detector_version", { mode: "number" }).notNull(),
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true }).notNull(),
    lastDetectedAt: timestamp("last_detected_at", { withTimezone: true }).notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("spending_warnings_user_id_fingerprint_unique").on(table.userId, table.fingerprint),
    index("spending_warnings_user_id_status_last_detected_at_id").on(
      table.userId,
      table.status,
      table.lastDetectedAt.desc(),
      table.id.desc()
    )
  ]
);

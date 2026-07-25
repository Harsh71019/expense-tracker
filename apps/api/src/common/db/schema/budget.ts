import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { categories } from "./category.js";

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    limitMinor: bigint("limit_minor", { mode: "number" }).notNull(),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check("budgets_limit_minor_positive", sql`${table.limitMinor} > 0`),
    uniqueIndex("budgets_user_id_category_id_unique").on(table.userId, table.categoryId),
    index("budgets_user_id_is_archived_created_at").on(
      table.userId,
      table.isArchived,
      table.createdAt,
      table.id
    )
  ]
);

/**
 * Immutable dedup/evidence rows for the daily threshold-alert cron -- never
 * updated or deleted (AGENTS.md's audit-log write-once rule applies here by
 * the same reasoning: they exist to prove an alert fired exactly once).
 */
export const budgetAlertEvents = pgTable(
  "budget_alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id),
    month: text("month").notNull(),
    policyVersion: integer("policy_version").notNull(),
    thresholdBps: integer("threshold_bps").notNull(),
    spentMinor: bigint("spent_minor", { mode: "number" }).notNull(),
    limitMinor: bigint("limit_minor", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check("budget_alert_events_threshold_bps_positive", sql`${table.thresholdBps} > 0`),
    check("budget_alert_events_policy_version_positive", sql`${table.policyVersion} > 0`),
    uniqueIndex("budget_alert_events_dedup_unique").on(
      table.userId,
      table.budgetId,
      table.month,
      table.policyVersion,
      table.thresholdBps
    ),
    index("budget_alert_events_user_id_month_created_at").on(
      table.userId,
      table.month,
      table.createdAt
    )
  ]
);

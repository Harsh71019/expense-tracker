import { sql } from "drizzle-orm";
import {
  bigint,
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
import { safetyBufferModeEnum } from "./enums.js";
import { goals } from "./goal.js";

/**
 * Effective-dated user safety buffer preferences. Append-only by construction:
 * updating a safety buffer appends a new version with a new effectiveFrom date.
 */
export const safetyBufferPreferences = pgTable(
  "safety_buffer_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    version: integer("version").notNull().default(1),
    mode: safetyBufferModeEnum("mode").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    months: integer("months"),
    emergencyFundGoalId: uuid("emergency_fund_goal_id").references(() => goals.id),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("safety_buffer_preferences_user_version_idx").on(table.userId, table.version),
    index("safety_buffer_preferences_user_effective_idx").on(
      table.userId,
      table.effectiveFrom.desc(),
      table.version.desc()
    ),
    check(
      "safety_buffer_preferences_amount_minor_valid",
      sql`${table.amountMinor} IS NULL OR ${table.amountMinor} >= 0`
    ),
    check(
      "safety_buffer_preferences_months_valid",
      sql`${table.months} IS NULL OR (${table.months} >= 1 AND ${table.months} <= 36)`
    )
  ]
);

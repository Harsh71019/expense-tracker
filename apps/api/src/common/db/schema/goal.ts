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
import { accounts } from "./account.js";
import { goalFundingModeEnum, goalStatusEnum } from "./enums.js";

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    targetMinor: bigint("target_minor", { mode: "number" }).notNull(),
    targetDate: timestamp("target_date", { withTimezone: true }),
    fundingMode: goalFundingModeEnum("funding_mode").notNull(),
    linkedAccountId: uuid("linked_account_id").references(() => accounts.id),
    tag: text("tag"),
    priority: integer("priority").notNull(),
    status: goalStatusEnum("status").notNull(),
    startedMinor: bigint("started_minor", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check("goals_target_minor_positive", sql`${table.targetMinor} > 0`),
    check("goals_priority_nonnegative", sql`${table.priority} >= 0`),
    check(
      "goals_funding_source_valid",
      sql`(
        (${table.fundingMode} = 'linked_account' AND ${table.linkedAccountId} IS NOT NULL AND ${table.tag} IS NULL)
        OR
        (${table.fundingMode} = 'tagged' AND ${table.linkedAccountId} IS NULL AND ${table.tag} IS NOT NULL)
      )`
    ),
    uniqueIndex("goals_user_id_tag_unique")
      .on(table.userId, table.tag)
      .where(sql`${table.tag} IS NOT NULL`),
    uniqueIndex("goals_linked_account_id_unique")
      .on(table.linkedAccountId)
      .where(sql`${table.status} = 'active' AND ${table.linkedAccountId} IS NOT NULL`),
    index("goals_user_id_status_priority").on(table.userId, table.status, table.priority)
  ]
);

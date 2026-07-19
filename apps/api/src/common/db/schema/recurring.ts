import { bigint, boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { accounts } from "./account.js";
import { categories } from "./category.js";
import { transactionTypeEnum } from "./enums.js";

export const recurringRules = pgTable(
  "recurring_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    templateAccountId: uuid("template_account_id")
      .notNull()
      .references(() => accounts.id),
    templateCategoryId: uuid("template_category_id").references(() => categories.id),
    templateType: transactionTypeEnum("template_type").notNull(),
    templateAmountMinor: bigint("template_amount_minor", { mode: "number" }).notNull(),
    templateDescription: text("template_description").notNull(),
    templateTags: text("template_tags").array().notNull().default([]),
    rrule: text("rrule").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    isPaused: boolean("is_paused").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("recurring_rules_user_id").on(table.userId),
    index("recurring_rules_is_paused_next_run_at").on(table.isPaused, table.nextRunAt)
  ]
);

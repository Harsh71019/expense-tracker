import { bigint, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";

export const monthlyRollups = pgTable(
  "monthly_rollups",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    month: text("month").notNull(),
    byCategory: jsonb("by_category").notNull(),
    byAccount: jsonb("by_account").notNull(),
    totalExpenseMinor: bigint("total_expense_minor", { mode: "number" }).notNull(),
    totalIncomeMinor: bigint("total_income_minor", { mode: "number" }).notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.month] })]
);

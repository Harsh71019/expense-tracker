import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { accounts } from "./account.js";
import { billReconciliationStatusEnum } from "./enums.js";

export const creditCardBills = pgTable(
  "credit_card_bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    cycleStart: timestamp("cycle_start", { withTimezone: true }).notNull(),
    cycleEnd: timestamp("cycle_end", { withTimezone: true }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    amountDueMinor: bigint("amount_due_minor", { mode: "number" }).notNull(),
    reconciliationStatus: billReconciliationStatusEnum("reconciliation_status")
      .notNull()
      .default("awaiting_statement"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("credit_card_bills_user_account_cycle_unique").on(
      table.userId,
      table.accountId,
      table.cycleEnd
    ),
    index("credit_card_bills_user_due_cursor").on(
      table.userId,
      table.dueDate.desc(),
      table.id.desc()
    ),
    index("credit_card_bills_user_account_cycle").on(
      table.userId,
      table.accountId,
      table.cycleEnd.desc()
    ),
    check("credit_card_bills_amount_nonnegative", sql`${table.amountDueMinor} >= 0`),
    check("credit_card_bills_cycle_order", sql`${table.cycleStart} <= ${table.cycleEnd}`)
  ]
);

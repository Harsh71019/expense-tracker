import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import {
  recurringReconciliationResolutionEnum,
  recurringReconciliationStatusEnum
} from "./enums.js";
import { recurringRules } from "./recurring.js";
import { transactions } from "./transaction.js";

export const recurringReconciliations = pgTable(
  "recurring_reconciliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    incomingTransactionId: uuid("incoming_transaction_id")
      .notNull()
      .references(() => transactions.id),
    recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id),
    recurringTransactionId: uuid("recurring_transaction_id").references(() => transactions.id),
    candidateRecurringTransactionIds: uuid("candidate_recurring_transaction_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    status: recurringReconciliationStatusEnum("status").notNull(),
    resolution: recurringReconciliationResolutionEnum("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("recurring_reconciliations_incoming_transaction_id_unique").on(
      table.incomingTransactionId
    ),
    index("recurring_reconciliations_user_id_status").on(table.userId, table.status)
  ]
);

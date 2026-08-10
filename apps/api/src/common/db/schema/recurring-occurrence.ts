import { index, pgTable, timestamp, uniqueIndex, uuid, text } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { recurringOccurrenceStatusEnum } from "./enums.js";
import { recurringRules } from "./recurring.js";
import { transactions } from "./transaction.js";

/**
 * One row per expected occurrence of a manual-post (`autoPost: false`)
 * recurring rule. Auto-post rules never get rows here — their occurrences are
 * just the transactions the materializer posts directly, unchanged.
 * `confirmedTransactionId` is set when a real ledger transaction (linked
 * manually or auto-matched by RecurringReconciliationService) satisfies this
 * occurrence; the transaction itself is untouched except for its
 * `recurringRuleId` column being attached. "missed" is not a stored status —
 * it's derived at read time from `status === "expected"` plus a grace period,
 * so there's no sweep job to keep it in sync.
 */
export const recurringOccurrences = pgTable(
  "recurring_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    recurringRuleId: uuid("recurring_rule_id")
      .notNull()
      .references(() => recurringRules.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: recurringOccurrenceStatusEnum("status").notNull().default("expected"),
    confirmedTransactionId: uuid("confirmed_transaction_id").references(() => transactions.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("recurring_occurrences_rule_occurred_at_unique").on(
      table.recurringRuleId,
      table.occurredAt
    ),
    uniqueIndex("recurring_occurrences_confirmed_transaction_unique").on(
      table.confirmedTransactionId
    ),
    index("recurring_occurrences_user_id_status").on(table.userId, table.status),
    index("recurring_occurrences_user_id_rule_id_occurred_at").on(
      table.userId,
      table.recurringRuleId,
      table.occurredAt
    )
  ]
);

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { accounts } from "./account.js";
import { pendingTransactionStatusEnum, transactionTypeEnum } from "./enums.js";
import { transactions } from "./transaction.js";

export const pendingTransactions = pgTable(
  "pending_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    type: transactionTypeEnum("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    description: text("description").notNull(),
    status: pendingTransactionStatusEnum("status").notNull(),
    resultingTransactionId: uuid("resulting_transaction_id").references(() => transactions.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [index("pending_transactions_user_id_status").on(table.userId, table.status)]
);

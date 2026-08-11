import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { accounts } from "./account.js";
import { categories } from "./category.js";
import { creditCardBills } from "./credit-card-bill.js";
import { transactionSourceEnum, transactionStatusEnum, transactionTypeEnum } from "./enums.js";
import { importBatches } from "./import.js";
import { recurringRules } from "./recurring.js";

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    categoryId: uuid("category_id").references(() => categories.id),
    type: transactionTypeEnum("type").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    description: text("description").notNull(),
    tags: text("tags").array().notNull().default([]),
    source: transactionSourceEnum("source").notNull(),
    status: transactionStatusEnum("status").notNull(),
    idempotencyKey: uuid("idempotency_key"),
    reversalOf: uuid("reversal_of").references((): AnyPgColumn => transactions.id),
    reversedBy: uuid("reversed_by").references((): AnyPgColumn => transactions.id),
    transferGroupId: uuid("transfer_group_id"),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id),
    billId: uuid("bill_id").references(() => creditCardBills.id),
    recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id),
    dedupeHash: text("dedupe_hash"),
    dedupeFingerprintV2: text("dedupe_fingerprint_v2"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("transactions_user_id_occurred_at").on(table.userId, table.occurredAt.desc()),
    index("transactions_user_id_account_id_occurred_at").on(
      table.userId,
      table.accountId,
      table.occurredAt.desc()
    ),
    index("transactions_user_id_category_id_occurred_at").on(
      table.userId,
      table.categoryId,
      table.occurredAt.desc()
    ),
    uniqueIndex("transactions_idempotency_key_unique")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    uniqueIndex("transactions_reversal_of_unique")
      .on(table.reversalOf)
      .where(sql`${table.reversalOf} IS NOT NULL`),
    index("transactions_transfer_group_id")
      .on(table.transferGroupId)
      .where(sql`${table.transferGroupId} IS NOT NULL`),
    uniqueIndex("transactions_user_id_dedupe_hash_unique")
      .on(table.userId, table.dedupeHash)
      .where(sql`${table.dedupeHash} IS NOT NULL`),
    uniqueIndex("transactions_user_id_dedupe_fingerprint_v2_unique")
      .on(table.userId, table.dedupeFingerprintV2)
      .where(sql`${table.dedupeFingerprintV2} IS NOT NULL`),
    index("transactions_import_batch_id")
      .on(table.importBatchId)
      .where(sql`${table.importBatchId} IS NOT NULL`),
    index("transactions_bill_id")
      .on(table.billId)
      .where(sql`${table.billId} IS NOT NULL`),
    index("transactions_recurring_rule_id")
      .on(table.recurringRuleId)
      .where(sql`${table.recurringRuleId} IS NOT NULL`)
  ]
);

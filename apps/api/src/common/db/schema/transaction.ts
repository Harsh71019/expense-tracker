import { sql } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { accounts } from "./account.js";
import { categories } from "./category.js";
import { transactionSourceEnum, transactionStatusEnum, transactionTypeEnum } from "./enums.js";

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
    reversalOf: uuid("reversal_of"),
    reversedBy: uuid("reversed_by"),
    transferGroupId: uuid("transfer_group_id"),
    // import_batches is still Mongo (Task 18 not done) -- its ids are ObjectId hex
    // strings, not UUIDs, so this can't be a real `uuid` column (or FK) yet. Revisit
    // once ImportBatchRepository is ported to Postgres.
    importBatchId: text("import_batch_id"),
    dedupeHash: text("dedupe_hash"),
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
    index("transactions_import_batch_id")
      .on(table.importBatchId)
      .where(sql`${table.importBatchId} IS NOT NULL`)
  ]
);

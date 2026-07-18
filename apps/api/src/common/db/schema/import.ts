import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { accounts } from "./account.js";
import { categories } from "./category.js";
import { importBatchStatusEnum, transactionTypeEnum } from "./enums.js";

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    filename: text("filename").notNull(),
    fileHash: text("file_hash").notNull(),
    mapping: jsonb("mapping").notNull(),
    status: importBatchStatusEnum("status").notNull(),
    statsTotal: integer("stats_total").notNull().default(0),
    statsStaged: integer("stats_staged").notNull().default(0),
    statsDuplicates: integer("stats_duplicates").notNull().default(0),
    statsCommitted: integer("stats_committed").notNull().default(0),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("import_batches_user_id_file_hash_committed_unique")
      .on(table.userId, table.fileHash)
      .where(sql`${table.status} = 'committed'`)
  ]
);

export const stagedRows = pgTable(
  "staged_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").notNull(),
    parsedOccurredAt: timestamp("parsed_occurred_at", { withTimezone: true }),
    parsedAmountMinor: bigint("parsed_amount_minor", { mode: "number" }),
    parsedType: transactionTypeEnum("parsed_type"),
    parsedDescription: text("parsed_description"),
    dedupeHash: text("dedupe_hash"),
    suggestedCategoryId: uuid("suggested_category_id").references(() => categories.id),
    problems: text("problems").array().notNull().default([]),
    isDuplicate: boolean("is_duplicate").notNull(),
    include: boolean("include").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("staged_rows_batch_id").on(table.batchId),
    index("staged_rows_created_at").on(table.createdAt)
  ]
);

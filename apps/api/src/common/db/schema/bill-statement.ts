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
import { transactions } from "./transaction.js";
import { creditCardBills } from "./credit-card-bill.js";
import {
  billStatementRowMatchStatusEnum,
  billStatementUploadStatusEnum,
  transactionTypeEnum
} from "./enums.js";

export const billStatementUploads = pgTable(
  "bill_statement_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    billId: uuid("bill_id")
      .notNull()
      .references(() => creditCardBills.id),
    filename: text("filename").notNull(),
    fileHash: text("file_hash").notNull(),
    mapping: jsonb("mapping").notNull(),
    status: billStatementUploadStatusEnum("status").notNull().default("pending"),
    active: boolean("active").notNull().default(true),
    statsTotal: integer("stats_total").notNull().default(0),
    statsMatched: integer("stats_matched").notNull().default(0),
    statsMissing: integer("stats_missing").notNull().default(0),
    statsAmbiguous: integer("stats_ambiguous").notNull().default(0),
    statsAcknowledged: integer("stats_acknowledged").notNull().default(0),
    acknowledgedExtraTransactionIds: uuid("acknowledged_extra_transaction_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("bill_statement_uploads_active_bill_unique")
      .on(table.billId)
      .where(sql`${table.active} = true`),
    uniqueIndex("bill_statement_uploads_user_bill_hash_unique").on(
      table.userId,
      table.billId,
      table.fileHash
    ),
    index("bill_statement_uploads_user_bill_created").on(
      table.userId,
      table.billId,
      table.createdAt.desc()
    )
  ]
);

export const billStatementRows = pgTable(
  "bill_statement_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    uploadId: uuid("upload_id")
      .notNull()
      .references(() => billStatementUploads.id),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").notNull(),
    parsedOccurredAt: timestamp("parsed_occurred_at", { withTimezone: true }),
    parsedAmountMinor: bigint("parsed_amount_minor", { mode: "number" }),
    parsedType: transactionTypeEnum("parsed_type"),
    parsedDescription: text("parsed_description"),
    matchedTransactionId: uuid("matched_transaction_id").references(() => transactions.id),
    matchStatus: billStatementRowMatchStatusEnum("match_status").notNull(),
    matchSuggestion: jsonb("match_suggestion"),
    acknowledged: boolean("acknowledged").notNull().default(false),
    problems: text("problems").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("bill_statement_rows_upload_row_unique").on(table.uploadId, table.rowNumber),
    uniqueIndex("bill_statement_rows_upload_match_unique")
      .on(table.uploadId, table.matchedTransactionId)
      .where(sql`${table.matchedTransactionId} IS NOT NULL`),
    index("bill_statement_rows_user_upload_cursor").on(table.userId, table.uploadId, table.id)
  ]
);

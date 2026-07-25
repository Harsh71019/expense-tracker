import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { accountTypeEnum } from "./enums.js";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    currency: text("currency").notNull().default("INR"),
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "number" }).notNull(),
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull(),
    statementDay: integer("statement_day"),
    dueDay: integer("due_day"),
    nextStatementAt: timestamp("next_statement_at", { withTimezone: true }),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("accounts_user_id_name_unique").on(table.userId, table.name),
    check(
      "accounts_credit_card_config_complete",
      sql`(
        (${table.statementDay} IS NULL AND ${table.dueDay} IS NULL AND ${table.nextStatementAt} IS NULL)
        OR
        (
          ${table.statementDay} BETWEEN 1 AND 31
          AND ${table.dueDay} BETWEEN 1 AND 31
          AND ${table.nextStatementAt} IS NOT NULL
        )
      )`
    )
  ]
);

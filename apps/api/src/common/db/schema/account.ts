import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
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
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("accounts_user_id_name_unique").on(table.userId, table.name),
    check(
      "accounts_opening_balance_minor_safe_integer",
      sql`${table.openingBalanceMinor} between ${sql.raw(String(-Number.MAX_SAFE_INTEGER))} and ${sql.raw(String(Number.MAX_SAFE_INTEGER))}`
    ),
    check(
      "accounts_balance_minor_safe_integer",
      sql`${table.balanceMinor} between ${sql.raw(String(-Number.MAX_SAFE_INTEGER))} and ${sql.raw(String(Number.MAX_SAFE_INTEGER))}`
    )
  ]
);

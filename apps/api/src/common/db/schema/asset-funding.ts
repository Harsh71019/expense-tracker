import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { assets } from "./asset.js";
import { assetFundingStatusEnum } from "./enums.js";
import { transactions } from "./transaction.js";

export const assetFundings = pgTable(
  "asset_fundings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: assetFundingStatusEnum("status").notNull(),
    reversalOf: uuid("reversal_of").references((): AnyPgColumn => assetFundings.id),
    reversedBy: uuid("reversed_by").references((): AnyPgColumn => assetFundings.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check("asset_fundings_amount_positive", sql`${table.amountMinor} > 0`),
    check(
      "asset_fundings_lifecycle_valid",
      sql`(${table.status} = 'posted' AND ${table.reversalOf} IS NULL AND ${table.reversedBy} IS NULL) OR (${table.status} = 'reversed' AND ${table.reversalOf} IS NULL AND ${table.reversedBy} IS NOT NULL) OR (${table.status} = 'reversal' AND ${table.reversalOf} IS NOT NULL AND ${table.reversedBy} IS NULL)`
    ),
    check(
      "asset_fundings_no_self_reversal",
      sql`${table.reversalOf} IS NULL OR ${table.reversalOf} <> ${table.id}`
    ),
    uniqueIndex("asset_fundings_active_source_unique")
      .on(table.userId, table.transactionId)
      .where(sql`${table.status} = 'posted'`),
    uniqueIndex("asset_fundings_reversal_of_unique")
      .on(table.reversalOf)
      .where(sql`${table.reversalOf} IS NOT NULL`),
    uniqueIndex("asset_fundings_reversed_by_unique")
      .on(table.reversedBy)
      .where(sql`${table.reversedBy} IS NOT NULL`),
    index("asset_fundings_user_asset_occurred_at_id").on(
      table.userId,
      table.assetId,
      table.occurredAt.desc(),
      table.id.desc()
    ),
    index("asset_fundings_user_transaction").on(table.userId, table.transactionId)
  ]
);

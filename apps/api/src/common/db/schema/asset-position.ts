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
import { assetFundings } from "./asset-funding.js";
import { assets } from "./asset.js";
import { assetPositionEventSourceEnum, assetPositionEventTypeEnum } from "./enums.js";
import { transactions } from "./transaction.js";

export const assetPositionEvents = pgTable(
  "asset_position_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    eventType: assetPositionEventTypeEnum("event_type").notNull(),
    quantityMicroUnits: bigint("quantity_micro_units", { mode: "number" }).notNull(),
    grossAmountMinor: bigint("gross_amount_minor", { mode: "number" }),
    chargesMinor: bigint("charges_minor", { mode: "number" }),
    taxesAtAcquisitionMinor: bigint("taxes_at_acquisition_minor", { mode: "number" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    transactionId: uuid("transaction_id").references(() => transactions.id),
    assetFundingId: uuid("asset_funding_id").references(() => assetFundings.id),
    source: assetPositionEventSourceEnum("source").notNull(),
    sourceReference: text("source_reference").notNull(),
    portfolioImportRowId: uuid("portfolio_import_row_id"),
    reversalOf: uuid("reversal_of").references((): AnyPgColumn => assetPositionEvents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "asset_position_events_quantity_safe_positive",
      sql`${table.quantityMicroUnits} BETWEEN 1 AND 9007199254740991`
    ),
    check(
      "asset_position_events_gross_amount_safe_positive",
      sql`${table.grossAmountMinor} IS NULL OR ${table.grossAmountMinor} BETWEEN 1 AND 9007199254740991`
    ),
    check(
      "asset_position_events_charges_safe_positive",
      sql`${table.chargesMinor} IS NULL OR ${table.chargesMinor} BETWEEN 1 AND 9007199254740991`
    ),
    check(
      "asset_position_events_taxes_safe_positive",
      sql`${table.taxesAtAcquisitionMinor} IS NULL OR ${table.taxesAtAcquisitionMinor} BETWEEN 1 AND 9007199254740991`
    ),
    check(
      "asset_position_events_reversal_link_matches_type",
      sql`(${table.eventType} = 'reversal' AND ${table.reversalOf} IS NOT NULL) OR (${table.eventType} <> 'reversal' AND ${table.reversalOf} IS NULL)`
    ),
    check(
      "asset_position_events_no_self_reversal",
      sql`${table.reversalOf} IS NULL OR ${table.reversalOf} <> ${table.id}`
    ),
    uniqueIndex("asset_position_events_user_source_reference_unique").on(
      table.userId,
      table.source,
      table.sourceReference
    ),
    uniqueIndex("asset_position_events_reversal_of_unique")
      .on(table.reversalOf)
      .where(sql`${table.reversalOf} IS NOT NULL`),
    index("asset_position_events_user_asset_occurred_at_id").on(
      table.userId,
      table.assetId,
      table.occurredAt.desc(),
      table.id.desc()
    ),
    index("asset_position_events_user_transaction").on(table.userId, table.transactionId),
    index("asset_position_events_user_asset_funding").on(table.userId, table.assetFundingId)
  ]
);

import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { type AnyPgColumn } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import {
  assetKindEnum,
  fundSchemeOptionEnum,
  fundSchemePlanEnum,
  marketDataProviderEnum,
  marketInstrumentTypeEnum,
  marketQuoteUnitEnum,
  sgbAcquisitionChannelEnum,
  valuationSourceEnum
} from "./enums.js";

export const assets = pgTable(
  "net_worth_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    kind: assetKindEnum("kind").notNull(),
    name: text("name").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    maturityAt: timestamp("maturity_at", { withTimezone: true }),
    annualRateBps: integer("annual_rate_bps"),
    quantityMilliUnits: bigint("quantity_milli_units", { mode: "number" }),
    isClosed: boolean("is_closed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [index("net_worth_assets_user_id_is_closed").on(table.userId, table.isClosed)]
);

export const assetValuations = pgTable(
  "asset_valuations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    valueMinor: bigint("value_minor", { mode: "number" }).notNull(),
    valuedAt: timestamp("valued_at", { withTimezone: true }).notNull(),
    source: valuationSourceEnum("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("asset_valuations_user_id_asset_id_valued_at").on(
      table.userId,
      table.assetId,
      table.valuedAt.desc()
    )
  ]
);

export const assetMarketLinks = pgTable(
  "asset_market_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    instrumentType: marketInstrumentTypeEnum("instrument_type").notNull(),
    provider: marketDataProviderEnum("provider").notNull(),
    providerInstrumentId: text("provider_instrument_id").notNull(),
    isin: text("isin"),
    schemeCode: text("scheme_code"),
    schemePlan: fundSchemePlanEnum("scheme_plan"),
    schemeOption: fundSchemeOptionEnum("scheme_option"),
    acquisitionChannel: sgbAcquisitionChannelEnum("acquisition_channel"),
    quoteUnit: marketQuoteUnitEnum("quote_unit").notNull(),
    purityBps: integer("purity_bps"),
    autoValuationEnabled: boolean("auto_valuation_enabled").notNull().default(true),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    revisionOf: uuid("revision_of").references((): AnyPgColumn => assetMarketLinks.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "asset_market_links_quote_unit_matches_instrument",
      sql`(${table.instrumentType} IN ('physical_gold', 'physical_silver') AND ${table.quoteUnit} = 'gram') OR (${table.instrumentType} NOT IN ('physical_gold', 'physical_silver') AND ${table.quoteUnit} = 'fund_unit')`
    ),
    check(
      "asset_market_links_purity_matches_instrument",
      sql`(${table.purityBps} IS NULL OR (${table.instrumentType} IN ('physical_gold', 'physical_silver') AND ${table.purityBps} BETWEEN 1 AND 10000))`
    ),
    check(
      "asset_market_links_sgb_acquisition_channel_matches_instrument",
      sql`(${table.acquisitionChannel} IS NULL OR ${table.instrumentType} = 'sgb')`
    ),
    check(
      "asset_market_links_no_self_revision",
      sql`${table.revisionOf} IS NULL OR ${table.revisionOf} <> ${table.id}`
    ),
    uniqueIndex("asset_market_links_one_active_per_asset")
      .on(table.userId, table.assetId)
      .where(sql`${table.supersededAt} IS NULL`),
    uniqueIndex("asset_market_links_revision_of_unique")
      .on(table.revisionOf)
      .where(sql`${table.revisionOf} IS NOT NULL`),
    index("asset_market_links_user_asset_effective_from").on(
      table.userId,
      table.assetId,
      table.effectiveFrom.desc(),
      table.id.desc()
    )
  ]
);

/**
 * Tenant-scoped quote provenance for an active market link. A value is never
 * updated in place: every provider observation is retained and valuations
 * point to its timestamp through their own append-only history.
 */
export const marketQuoteSnapshots = pgTable(
  "market_quote_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    assetMarketLinkId: uuid("asset_market_link_id")
      .notNull()
      .references(() => assetMarketLinks.id),
    provider: marketDataProviderEnum("provider").notNull(),
    providerInstrumentId: text("provider_instrument_id").notNull(),
    quoteUnit: marketQuoteUnitEnum("quote_unit").notNull(),
    priceMicroRupeesPerQuoteUnit: bigint("price_micro_rupees_per_quote_unit", {
      mode: "number"
    }).notNull(),
    providerAsOf: timestamp("provider_as_of", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "market_quote_snapshots_price_safe_positive",
      sql`${table.priceMicroRupeesPerQuoteUnit} BETWEEN 1 AND 9007199254740991`
    ),
    uniqueIndex("market_quote_snapshots_link_provider_asof_unique").on(
      table.userId,
      table.assetMarketLinkId,
      table.provider,
      table.providerAsOf
    ),
    index("market_quote_snapshots_user_link_provider_asof").on(
      table.userId,
      table.assetMarketLinkId,
      table.providerAsOf.desc()
    )
  ]
);

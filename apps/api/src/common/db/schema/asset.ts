import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { assetKindEnum, valuationSourceEnum } from "./enums.js";

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

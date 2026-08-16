import {
  bigint,
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

/** Immutable worker-produced evidence. Forecasts never modify ledger data. */
export const cashflowForecastSnapshots = pgTable(
  "cashflow_forecast_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    horizonDays: integer("horizon_days").notNull(),
    modelVersion: integer("model_version").notNull(),
    inputDigest: text("input_digest").notNull(),
    inputWatermark: jsonb("input_watermark").notNull(),
    sufficiency: jsonb("sufficiency").notNull(),
    resources: jsonb("resources").notNull(),
    model: text("model").notNull(),
    pointBalanceMinor: bigint("point_balance_minor", { mode: "number" }).notNull(),
    range: jsonb("range").notNull(),
    assumptions: jsonb("assumptions").notNull(),
    metrics: jsonb("metrics").notNull(),
    shortfall: jsonb("shortfall").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull()
  },
  (table) => [
    uniqueIndex("cashflow_forecast_snapshots_retry_key").on(
      table.userId,
      table.asOf,
      table.horizonDays,
      table.modelVersion,
      table.inputDigest
    ),
    index("cashflow_forecast_snapshots_user_computed").on(
      table.userId,
      table.computedAt.desc(),
      table.id
    )
  ]
);

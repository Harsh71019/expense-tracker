import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { type AnyPgColumn } from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { reserveLiquidityTierEnum, reserveSourceKindEnum } from "./enums.js";

/**
 * Emergency reserve source classification -- planning metadata only.
 *
 * This table never stores an independent copy of an account balance or asset
 * valuation. It stores a liquidity tier, an inclusion flag, and an optional
 * eligible cap against an existing `(sourceKind, sourceId)` pair. The
 * canonical value is always read fresh from `accounts.balance_minor` or the
 * asset's latest valuation at evaluation time -- see
 * `ReserveValueService`/`evaluateReserveSources`.
 *
 * Effective-dated/revision model, mirroring `asset_market_links`: nothing is
 * ever updated in place. Changing a classification supersedes the current
 * active row (`superseded_at` set) and appends a new one pointing back via
 * `revision_of`, so classification history is retained for audit and for any
 * future "what was configured at date X" read. `source_id` is intentionally
 * not a foreign key -- it is polymorphic across `accounts.id` and
 * `net_worth_assets.id` depending on `source_kind`, and ownership is verified
 * in the service layer against the correct domain table before any write.
 */
export const financialReserveSources = pgTable(
  "financial_reserve_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    sourceKind: reserveSourceKindEnum("source_kind").notNull(),
    sourceId: uuid("source_id").notNull(),
    liquidityTier: reserveLiquidityTierEnum("liquidity_tier").notNull(),
    isIncluded: boolean("is_included").notNull().default(true),
    eligibleCapMinor: bigint("eligible_cap_minor", { mode: "number" }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    revisionOf: uuid("revision_of").references((): AnyPgColumn => financialReserveSources.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "financial_reserve_sources_cap_safe_positive",
      sql`${table.eligibleCapMinor} IS NULL OR ${table.eligibleCapMinor} BETWEEN 1 AND 9007199254740991`
    ),
    check(
      "financial_reserve_sources_no_self_revision",
      sql`${table.revisionOf} IS NULL OR ${table.revisionOf} <> ${table.id}`
    ),
    // One current active classification per user/source pair. Source identity
    // is the (sourceKind, sourceId) compound -- a UUID collision between an
    // account and an asset must never be treated as the same source.
    uniqueIndex("financial_reserve_sources_one_active_per_source")
      .on(table.userId, table.sourceKind, table.sourceId)
      .where(sql`${table.supersededAt} IS NULL`),
    uniqueIndex("financial_reserve_sources_revision_of_unique")
      .on(table.revisionOf)
      .where(sql`${table.revisionOf} IS NOT NULL`),
    // Tenant-scoped active listing, cursor-paginated on (sourceKind, sourceId).
    index("financial_reserve_sources_user_active_kind_id").on(
      table.userId,
      table.sourceKind,
      table.sourceId
    ),
    // Deterministic current-version lookup / history ordering.
    index("financial_reserve_sources_user_source_effective_from").on(
      table.userId,
      table.sourceKind,
      table.sourceId,
      table.effectiveFrom.desc(),
      table.id.desc()
    )
  ]
);

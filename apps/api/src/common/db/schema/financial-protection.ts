import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { assets } from "./asset.js";
import {
  declaredDebtKindEnum,
  declaredDebtStatusEnum,
  healthCoverStatusEnum,
  termCoverStatusEnum,
  termNotApplicableReasonEnum
} from "./enums.js";

/**
 * Effective-dated protection facts. Append-only by construction: nothing in the
 * application updates or deletes a row here — changing an answer appends a new
 * snapshot with a new `effective_from`, so a past evaluation keeps the facts
 * that actually applied when it ran.
 *
 * Insurance cover is a *protection fact*, never an asset: no code path may sum
 * these columns into net worth.
 *
 * Deliberately absent: policy numbers, insurer credentials, document images,
 * card PANs, and any free-text medical field. The CHECK constraints below
 * mirror the Zod invariants in packages/shared/src/financial-protection.ts so a
 * direct SQL write cannot create a combination the API would have rejected.
 */
export const protectionSnapshots = pgTable(
  "protection_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    termCoverStatus: termCoverStatusEnum("term_cover_status").notNull(),
    independentTermCoverMinor: bigint("independent_term_cover_minor", { mode: "number" }),
    employerTermCoverMinor: bigint("employer_term_cover_minor", { mode: "number" }),
    independentTermExpiresOn: timestamp("independent_term_expires_on", { withTimezone: true }),
    termNotApplicableReason: termNotApplicableReasonEnum("term_not_applicable_reason"),
    healthCoverStatus: healthCoverStatusEnum("health_cover_status").notNull(),
    independentHealthBaseCoverMinor: bigint("independent_health_base_cover_minor", {
      mode: "number"
    }),
    independentHealthSuperTopUpMinor: bigint("independent_health_super_top_up_minor", {
      mode: "number"
    }),
    employerHealthCoverMinor: bigint("employer_health_cover_minor", { mode: "number" }),
    independentHealthExpiresOn: timestamp("independent_health_expires_on", { withTimezone: true }),
    dependantCount: integer("dependant_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "protection_snapshots_dependant_count_valid",
      sql`${table.dependantCount} >= 0 AND ${table.dependantCount} <= 20`
    ),
    check(
      "protection_snapshots_cover_amounts_positive",
      sql`(${table.independentTermCoverMinor} IS NULL OR ${table.independentTermCoverMinor} > 0)
        AND (${table.employerTermCoverMinor} IS NULL OR ${table.employerTermCoverMinor} > 0)
        AND (${table.independentHealthBaseCoverMinor} IS NULL OR ${table.independentHealthBaseCoverMinor} > 0)
        AND (${table.independentHealthSuperTopUpMinor} IS NULL OR ${table.independentHealthSuperTopUpMinor} > 0)
        AND (${table.employerHealthCoverMinor} IS NULL OR ${table.employerHealthCoverMinor} > 0)`
    ),
    // A structured reason belongs with `not_applicable` and nowhere else.
    check(
      "protection_snapshots_not_applicable_reason_valid",
      sql`(${table.termCoverStatus} = 'not_applicable') = (${table.termNotApplicableReason} IS NOT NULL)`
    ),
    check(
      "protection_snapshots_term_cover_source_valid",
      sql`(${table.termCoverStatus} IN ('independent', 'both')
          OR (${table.independentTermCoverMinor} IS NULL AND ${table.independentTermExpiresOn} IS NULL))
        AND (${table.termCoverStatus} IN ('employer_only', 'both') OR ${table.employerTermCoverMinor} IS NULL)`
    ),
    check(
      "protection_snapshots_health_cover_source_valid",
      sql`(${table.healthCoverStatus} IN ('independent', 'both')
          OR (${table.independentHealthBaseCoverMinor} IS NULL
            AND ${table.independentHealthSuperTopUpMinor} IS NULL
            AND ${table.independentHealthExpiresOn} IS NULL))
        AND (${table.healthCoverStatus} IN ('employer_only', 'both') OR ${table.employerHealthCoverMinor} IS NULL)`
    ),
    // One snapshot per user per effective instant: a correction appends on a
    // different date, it never overwrites an existing snapshot.
    uniqueIndex("protection_snapshots_user_id_effective_from_unique").on(
      table.userId,
      table.effectiveFrom
    ),
    // Effective-snapshot lookup: newest `effective_from <= asOf`, tie-broken by id.
    index("protection_snapshots_user_id_effective_from_id").on(
      table.userId,
      table.effectiveFrom.desc(),
      table.id.desc()
    )
  ]
);

/**
 * Declared high-cost debts — planning metadata, not a ledger balance and not a
 * parallel liability-account system.
 *
 * A debt may link to an existing open `loan_liability` asset owned by the same
 * user; when it does, its current outstanding amount is *derived* from that
 * asset's latest valuation and is deliberately not stored here, so there is
 * only ever one number to trust. An unlinked debt stores the user's own
 * estimate instead. Resolving a debt is a status change: rows are never
 * deleted, and the linked asset is never modified, valued, or closed by it.
 */
export const declaredDebts = pgTable(
  "declared_debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    kind: declaredDebtKindEnum("kind").notNull(),
    declaredOutstandingMinor: bigint("declared_outstanding_minor", { mode: "number" }),
    annualRateBps: integer("annual_rate_bps").notNull(),
    minimumPaymentMinor: bigint("minimum_payment_minor", { mode: "number" }),
    linkedAssetId: uuid("linked_asset_id").references(() => assets.id),
    status: declaredDebtStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
  },
  (table) => [
    check(
      "declared_debts_annual_rate_bps_valid",
      sql`${table.annualRateBps} >= 0 AND ${table.annualRateBps} <= 100000`
    ),
    check(
      "declared_debts_amounts_positive",
      sql`(${table.declaredOutstandingMinor} IS NULL OR ${table.declaredOutstandingMinor} > 0)
        AND (${table.minimumPaymentMinor} IS NULL OR ${table.minimumPaymentMinor} > 0)`
    ),
    // Exactly one source of truth for the outstanding amount: the linked
    // asset's valuation, or the user's declared estimate — never both.
    check(
      "declared_debts_amount_source_valid",
      sql`(${table.linkedAssetId} IS NULL) = (${table.declaredOutstandingMinor} IS NOT NULL)`
    ),
    check(
      "declared_debts_resolved_at_valid",
      sql`(${table.status} = 'resolved') = (${table.resolvedAt} IS NOT NULL)`
    ),
    // Active-first listing, cursor-paginated on (created_at, id).
    index("declared_debts_user_id_status_created_at_id").on(
      table.userId,
      table.status,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("declared_debts_user_id_linked_asset_id").on(table.userId, table.linkedAssetId)
  ]
);

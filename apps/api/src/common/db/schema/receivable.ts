import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { user } from "../auth-schema.js";
import { assets, assetValuations } from "./asset.js";
import { receivableEventKindEnum } from "./enums.js";
import { transactions } from "./transaction.js";

// No status/original_principal_minor/repaid_minor/outstanding_minor column:
// those are derived from `receivable_events` on every read so they cannot
// drift from installment/reversal history (plan doc §7.1, §8, ADR-DG-004).
export const receivables = pgTable(
  "receivables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    counterpartyName: text("counterparty_name").notNull(),
    note: text("note"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    legacyAssetId: uuid("legacy_asset_id").references(() => assets.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    index("receivables_user_id_created_at").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index("receivables_user_id_due_at")
      .on(table.userId, table.dueAt)
      .where(sql`${table.dueAt} IS NOT NULL`),
    uniqueIndex("receivables_legacy_asset_id_unique")
      .on(table.legacyAssetId)
      .where(sql`${table.legacyAssetId} IS NOT NULL`)
  ]
);

// A manual cash-moving event (opening/repayment) links to exactly one
// transaction; a legacy-migrated event links to exactly one source valuation;
// neither combination can be verified against the linked table's contents by
// a CHECK constraint, so cross-table direction/status/tenant agreement stays
// a service-layer rule (plan doc §7.2) — this constraint only enforces the
// locally-checkable half: which kinds are allowed to carry which link.
export const receivableEvents = pgTable(
  "receivable_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    receivableId: uuid("receivable_id")
      .notNull()
      .references(() => receivables.id),
    kind: receivableEventKindEnum("kind").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    transactionId: uuid("transaction_id").references(() => transactions.id),
    legacyValuationId: uuid("legacy_valuation_id").references(() => assetValuations.id),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "receivable_events_amount_minor_safe_integer",
      sql`${table.amountMinor} between 1 and ${sql.raw(String(Number.MAX_SAFE_INTEGER))}`
    ),
    check(
      "receivable_events_correction_requires_reason",
      sql`(${table.kind} NOT IN ('correction_increase', 'correction_decrease')) OR (${table.reason} IS NOT NULL)`
    ),
    // Only `legacy_increase` strictly requires a source valuation. A closed
    // legacy asset with residual balance also gets one synthetic
    // `legacy_decrease` with no valuation link, to zero it out at migration
    // time (plan doc §13.1 step 7) — that event has no single valuation row
    // to point to.
    check(
      "receivable_events_legacy_increase_requires_legacy_valuation",
      sql`(${table.kind} <> 'legacy_increase') OR (${table.legacyValuationId} IS NOT NULL)`
    ),
    check(
      "receivable_events_non_legacy_excludes_legacy_valuation",
      sql`(${table.kind} IN ('legacy_increase', 'legacy_decrease')) OR (${table.legacyValuationId} IS NULL)`
    ),
    uniqueIndex("receivable_events_transaction_id_unique")
      .on(table.transactionId)
      .where(sql`${table.transactionId} IS NOT NULL`),
    uniqueIndex("receivable_events_legacy_valuation_id_unique")
      .on(table.legacyValuationId)
      .where(sql`${table.legacyValuationId} IS NOT NULL`),
    index("receivable_events_user_id_receivable_id_occurred_at").on(
      table.userId,
      table.receivableId,
      table.occurredAt.desc(),
      table.id.desc()
    )
  ]
);

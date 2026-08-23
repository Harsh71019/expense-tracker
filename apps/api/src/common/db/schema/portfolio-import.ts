import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
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
  marketInstrumentTypeEnum,
  portfolioImportRowActionEnum,
  portfolioImportRowKindEnum,
  portfolioImportRowMatchStatusEnum,
  portfolioImportSourceEnum,
  portfolioImportStatusEnum
} from "./enums.js";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** A user-scoped CAS import state machine. The raw document lives only in the payload table. */
export const portfolioImportBatches = pgTable(
  "portfolio_import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    source: portfolioImportSourceEnum("source").notNull(),
    filename: text("filename").notNull(),
    fileHash: text("file_hash").notNull(),
    status: portfolioImportStatusEnum("status").notNull(),
    statementAsOf: timestamp("statement_as_of", { withTimezone: true }),
    coverageFrom: timestamp("coverage_from", { withTimezone: true }),
    coverageTo: timestamp("coverage_to", { withTimezone: true }),
    rowCount: integer("row_count").notNull().default(0),
    includedCount: integer("included_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    failureCode: text("failure_code"),
    leaseOwner: uuid("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    check(
      "portfolio_import_batches_counts_nonnegative",
      sql`${table.rowCount} >= 0 AND ${table.includedCount} >= 0 AND ${table.warningCount} >= 0 AND ${table.errorCount} >= 0 AND ${table.attemptCount} >= 0`
    ),
    uniqueIndex("portfolio_import_batches_user_file_hash_active_unique")
      .on(table.userId, table.fileHash)
      .where(sql`${table.status} NOT IN ('completed', 'reverted', 'failed')`),
    index("portfolio_import_batches_user_created_at").on(table.userId, table.createdAt.desc()),
    index("portfolio_import_batches_worker_ready").on(table.status, table.leaseExpiresAt)
  ]
);

/** AES-GCM-sealed source material, removed once normalized rows are staged. */
export const portfolioImportPayloads = pgTable(
  "portfolio_import_payloads",
  {
    batchId: uuid("batch_id")
      .primaryKey()
      .references(() => portfolioImportBatches.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    encryptedFile: bytea("encrypted_file").notNull(),
    fileNonce: bytea("file_nonce").notNull(),
    fileAuthTag: bytea("file_auth_tag").notNull(),
    encryptedPassword: bytea("encrypted_password"),
    passwordNonce: bytea("password_nonce"),
    passwordAuthTag: bytea("password_auth_tag"),
    keyVersion: integer("key_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "portfolio_import_payloads_password_cipher_complete",
      sql`(${table.encryptedPassword} IS NULL AND ${table.passwordNonce} IS NULL AND ${table.passwordAuthTag} IS NULL) OR (${table.encryptedPassword} IS NOT NULL AND ${table.passwordNonce} IS NOT NULL AND ${table.passwordAuthTag} IS NOT NULL)`
    ),
    index("portfolio_import_payloads_expiry").on(table.expiresAt)
  ]
);

/** Normalized, reviewable facts only; raw PDF text and personal data never enter this table. */
export const portfolioImportRows = pgTable(
  "portfolio_import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => portfolioImportBatches.id),
    rowNumber: integer("row_number").notNull(),
    rowKind: portfolioImportRowKindEnum("row_kind").notNull(),
    semanticFingerprint: text("semantic_fingerprint").notNull(),
    instrumentType: marketInstrumentTypeEnum("instrument_type").notNull(),
    isin: text("isin"),
    schemeCode: text("scheme_code"),
    displayName: text("display_name").notNull(),
    folioReferenceMasked: text("folio_reference_masked"),
    transactionType: text("transaction_type"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    quantityMicroUnits: bigint("quantity_micro_units", { mode: "number" }),
    grossAmountMinor: bigint("gross_amount_minor", { mode: "number" }),
    navMicroRupeesPerUnit: bigint("nav_micro_rupees_per_unit", { mode: "number" }),
    proposedAssetId: uuid("proposed_asset_id").references(() => assets.id),
    matchStatus: portfolioImportRowMatchStatusEnum("match_status").notNull(),
    proposedAction: portfolioImportRowActionEnum("proposed_action").notNull(),
    include: boolean("include").notNull().default(true),
    warningCode: text("warning_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check("portfolio_import_rows_number_nonnegative", sql`${table.rowNumber} > 0`),
    check(
      "portfolio_import_rows_quantity_safe",
      sql`${table.quantityMicroUnits} IS NULL OR ${table.quantityMicroUnits} BETWEEN 1 AND 9007199254740991`
    ),
    check(
      "portfolio_import_rows_amount_safe",
      sql`${table.grossAmountMinor} IS NULL OR ${table.grossAmountMinor} BETWEEN 1 AND 9007199254740991`
    ),
    check(
      "portfolio_import_rows_nav_safe",
      sql`${table.navMicroRupeesPerUnit} IS NULL OR ${table.navMicroRupeesPerUnit} BETWEEN 1 AND 9007199254740991`
    ),
    uniqueIndex("portfolio_import_rows_batch_fingerprint_unique").on(
      table.batchId,
      table.semanticFingerprint
    ),
    index("portfolio_import_rows_user_batch_number").on(
      table.userId,
      table.batchId,
      table.rowNumber
    ),
    index("portfolio_import_rows_user_proposed_asset").on(table.userId, table.proposedAssetId)
  ]
);

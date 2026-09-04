import {
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

/**
 * Immutable Safety Evaluation snapshots (Formula/Policy Version 1).
 *
 * A row is evidence/history, never a second source of truth -- the canonical
 * inputs always live in Essential Burn, Reserve Value, the protection
 * profile, declared debts, and the financial profile. There is no update or
 * delete path: a changed input produces a new row with a new
 * `input_fingerprint`, never a mutation of an existing one. See
 * `SafetyEvaluationRepository`/`SafetyEvaluationService`.
 */
export const financialSafetyEvaluations = pgTable(
  "financial_safety_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    inputFingerprint: text("input_fingerprint").notNull(),
    formulaVersion: integer("formula_version").notNull(),
    policyVersion: integer("policy_version").notNull(),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    sourceThrough: timestamp("source_through", { withTimezone: true }).notNull(),
    resultJson: jsonb("result_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    // One immutable evaluation per user + fingerprint + engine/policy version --
    // a duplicate refresh request under identical facts returns this row
    // instead of inserting a second one.
    uniqueIndex("financial_safety_evaluations_identity_idx").on(
      table.userId,
      table.inputFingerprint,
      table.formulaVersion,
      table.policyVersion
    ),
    // Tenant-scoped "most recent evaluation" lookup for dashboard reuse.
    index("financial_safety_evaluations_user_created_idx").on(table.userId, table.createdAt.desc())
  ]
);

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
import { incomeStabilityEnum, salarySourceEnum } from "./enums.js";

/**
 * Stable work preferences. Deliberately separate from `user_profiles`
 * (display name/locale): salary-adjacent facts are confidential financial
 * data with their own lifecycle, and the display-name table must not become
 * a dumping ground for them.
 */
export const financialProfiles = pgTable(
  "financial_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id),
    monthlyWorkMinutes: integer("monthly_work_minutes").notNull(),
    salaryCreditDay: integer("salary_credit_day"),
    expectedAnnualIncrementBps: integer("expected_annual_increment_bps"),
    incomeStability: incomeStabilityEnum("income_stability").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "financial_profiles_monthly_work_minutes_valid",
      sql`${table.monthlyWorkMinutes} > 0 AND ${table.monthlyWorkMinutes} <= 44640`
    ),
    check(
      "financial_profiles_salary_credit_day_valid",
      sql`${table.salaryCreditDay} IS NULL OR (${table.salaryCreditDay} >= 1 AND ${table.salaryCreditDay} <= 31)`
    ),
    check(
      "financial_profiles_increment_bps_valid",
      sql`${table.expectedAnnualIncrementBps} IS NULL OR (${table.expectedAnnualIncrementBps} >= 0 AND ${table.expectedAnnualIncrementBps} <= 100000)`
    )
  ]
);

/**
 * Effective-dated net in-hand salary facts. Append-only by construction:
 * nothing in the application updates or deletes a row here — a salary change
 * is a new version with a new `effective_from`.
 */
export const salaryVersions = pgTable(
  "salary_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    netMonthlySalaryMinor: bigint("net_monthly_salary_minor", { mode: "number" }).notNull(),
    annualCtcMinor: bigint("annual_ctc_minor", { mode: "number" }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    source: salarySourceEnum("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check(
      "salary_versions_net_monthly_salary_minor_positive",
      sql`${table.netMonthlySalaryMinor} > 0`
    ),
    check(
      "salary_versions_annual_ctc_minor_positive",
      sql`${table.annualCtcMinor} IS NULL OR ${table.annualCtcMinor} > 0`
    ),
    // One version per user per effective instant: a correction appends a
    // version on a different date, it never overwrites an existing one.
    uniqueIndex("salary_versions_user_id_effective_from_unique").on(
      table.userId,
      table.effectiveFrom
    ),
    // Effective-salary lookup: newest `effective_from <= asOf`, tie-broken by id.
    index("salary_versions_user_id_effective_from_id").on(
      table.userId,
      table.effectiveFrom.desc(),
      table.id.desc()
    )
  ]
);

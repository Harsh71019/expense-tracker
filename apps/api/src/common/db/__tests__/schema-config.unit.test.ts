import { createTableRelationsHelpers, extractTablesRelationalConfig } from "drizzle-orm/relations";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as authSchema from "../auth-schema.js";
import {
  accounts,
  assetValuations,
  assets,
  auditLog,
  budgetAlertEvents,
  budgets,
  categories,
  categoryRules,
  goals,
  idempotencyRecords,
  importBatches,
  monthlyRollups,
  notificationOutbox,
  recurringRules,
  stagedRows,
  transactions,
  userProfiles
} from "../schema/index.js";

describe("Drizzle schema configuration", () => {
  it("materializes every application table's indexes, constraints, and foreign keys", () => {
    const tables = [
      accounts,
      assetValuations,
      assets,
      auditLog,
      budgetAlertEvents,
      budgets,
      categories,
      categoryRules,
      goals,
      idempotencyRecords,
      importBatches,
      monthlyRollups,
      notificationOutbox,
      recurringRules,
      stagedRows,
      transactions,
      userProfiles
    ];

    const configs = tables.map((table) => getTableConfig(table));

    expect(configs).toHaveLength(tables.length);
    expect(configs.map((config) => config.name)).toContain("transactions");
    expect(configs.flatMap((config) => config.indexes).length).toBeGreaterThan(0);
  });

  it("materializes Better Auth tables and relation callbacks", () => {
    const configs = [
      authSchema.user,
      authSchema.session,
      authSchema.account,
      authSchema.verification,
      authSchema.apikey
    ].map((table) => getTableConfig(table));

    const relational = extractTablesRelationalConfig(authSchema, createTableRelationsHelpers);

    expect(configs.map((config) => config.name)).toEqual([
      "user",
      "session",
      "account",
      "verification",
      "apikey"
    ]);
    expect(Object.keys(relational.tables)).toEqual(
      expect.arrayContaining(["user", "session", "account"])
    );
  });
});

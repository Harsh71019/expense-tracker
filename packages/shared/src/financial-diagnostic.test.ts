import { describe, expect, it } from "vitest";

import {
  ASSET_VALUATION_FRESHNESS_DAYS,
  BURN_HISTORY_FRESHNESS_DAYS,
  BURN_HISTORY_REQUIRED_MONTHS,
  FinancialAttentionLevelSchema,
  FinancialCapabilityKeySchema,
  FinancialDiagnosticActionKeySchema,
  FinancialDiagnosticEvidenceSchema,
  FinancialDiagnosticKeySchema,
  FinancialDiagnosticOverallStatusSchema,
  FinancialDiagnosticQuerySchema,
  FinancialDiagnosticSchema,
  FinancialDiagnosticSourceKeySchema,
  FinancialReadinessItemSchema,
  FinancialReadinessStatusSchema
} from "./financial-diagnostic.js";

describe("financial-diagnostic shared contracts", () => {
  it("validates all readiness statuses", () => {
    const valid = ["missing", "estimated", "limited", "ready", "stale"];
    for (const status of valid) {
      expect(FinancialReadinessStatusSchema.parse(status)).toBe(status);
    }
    expect(() => FinancialReadinessStatusSchema.parse("invalid")).toThrow();
  });

  it("validates all attention levels", () => {
    const valid = ["none", "information", "warning", "blocking"];
    for (const level of valid) {
      expect(FinancialAttentionLevelSchema.parse(level)).toBe(level);
    }
    expect(() => FinancialAttentionLevelSchema.parse("critical")).toThrow();
  });

  it("validates closed diagnostic keys", () => {
    const valid = [
      "salary",
      "work_schedule",
      "accounts",
      "essential_categories",
      "burn_history",
      "protection",
      "debt_inventory",
      "safety_buffer",
      "assets",
      "asset_valuations",
      "goals",
      "reserve_sources"
    ];
    for (const key of valid) {
      expect(FinancialDiagnosticKeySchema.parse(key)).toBe(key);
    }
    expect(() => FinancialDiagnosticKeySchema.parse("crypto")).toThrow();
  });

  it("validates closed source keys", () => {
    const valid = [
      "financial_profile",
      "protection_profile",
      "debt_profile",
      "accounts",
      "categories",
      "ledger",
      "safety_buffer",
      "assets",
      "goals",
      "reserves"
    ];
    for (const source of valid) {
      expect(FinancialDiagnosticSourceKeySchema.parse(source)).toBe(source);
    }
    expect(() => FinancialDiagnosticSourceKeySchema.parse("bank_api")).toThrow();
  });

  it("validates closed action keys and rejects arbitrary URLs or routes", () => {
    const valid = [
      "configure_salary",
      "configure_protection",
      "review_debts",
      "create_account",
      "review_categories",
      "review_transactions",
      "configure_safety_buffer",
      "review_assets",
      "refresh_asset_valuations",
      "create_goal",
      "configure_reserves"
    ];
    for (const action of valid) {
      expect(FinancialDiagnosticActionKeySchema.parse(action)).toBe(action);
    }
    expect(() => FinancialDiagnosticActionKeySchema.parse("/settings/salary")).toThrow();
    expect(() => FinancialDiagnosticActionKeySchema.parse("https://example.com")).toThrow();
  });

  it("validates capability keys", () => {
    const valid = [
      "salary_statistics",
      "life_hour",
      "essential_burn",
      "financial_runway",
      "safety_ladder",
      "goal_feasibility",
      "payday_plan",
      "wealth_allocation",
      "projections"
    ];
    for (const cap of valid) {
      expect(FinancialCapabilityKeySchema.parse(cap)).toBe(cap);
    }
    expect(() => FinancialCapabilityKeySchema.parse("arbitrary_capability")).toThrow();
  });

  it("validates evidence schema with bounded non-sensitive fields", () => {
    const evidence = FinancialDiagnosticEvidenceSchema.parse({
      observedCount: 2,
      requiredCount: 3,
      completeMonthCount: 1,
      activeCount: 4,
      estimatedCount: 0,
      staleCount: 0,
      highCostDebtCount: 0,
      missingValuationCount: 0,
      latestObservedAt: new Date("2026-08-16T00:00:00.000Z"),
      oldestRelevantAt: null,
      freshnessThresholdDays: 90
    });
    expect(evidence.observedCount).toBe(2);
    expect(evidence.freshnessThresholdDays).toBe(90);

    // Rejects negative counts
    expect(() =>
      FinancialDiagnosticEvidenceSchema.parse({
        observedCount: -1
      })
    ).toThrow();

    // Rejects unknown keys strictly
    expect(() =>
      FinancialDiagnosticEvidenceSchema.parse({
        salaryAmount: 100000
      })
    ).toThrow();
  });

  it("validates complete readiness item and full diagnostic payload", () => {
    const item = FinancialReadinessItemSchema.parse({
      key: "salary",
      status: "ready",
      attention: "none",
      source: "financial_profile",
      lastUpdatedAt: new Date("2026-08-01T00:00:00.000Z"),
      requiredFor: ["salary_statistics", "life_hour", "goal_feasibility"],
      action: null,
      evidence: {
        activeCount: 1,
        latestObservedAt: new Date("2026-08-01T00:00:00.000Z")
      },
      summaryKey: "salary.ready",
      limitationKeys: []
    });
    expect(item.key).toBe("salary");
    expect(item.status).toBe("ready");

    const diagnostic = FinancialDiagnosticSchema.parse({
      computedAt: new Date("2026-08-18T10:00:00.000Z"),
      sourceThrough: new Date("2026-08-18T10:00:00.000Z"),
      formulaVersion: 1,
      policyVersion: 1,
      overallStatus: "ready",
      readyCount: 1,
      totalRequiredCount: 4,
      availableCapabilities: ["salary_statistics"],
      unavailableCapabilities: ["financial_runway", "safety_ladder"],
      nextAction: "create_account",
      items: [item],
      limitations: ["Burn history limited to 1 month."]
    });

    expect(diagnostic.overallStatus).toBe("ready");
    expect(diagnostic.formulaVersion).toBe(1);
    expect(diagnostic.nextAction).toBe("create_account");
  });

  it("validates query schema with optional asOf", () => {
    const emptyQuery = FinancialDiagnosticQuerySchema.parse({});
    expect(emptyQuery.asOf).toBeUndefined();

    const dateQuery = FinancialDiagnosticQuerySchema.parse({
      asOf: "2026-08-16T00:00:00.000Z"
    });
    expect(dateQuery.asOf).toBeInstanceOf(Date);
  });

  it("exports valid versioned policy constants", () => {
    expect(BURN_HISTORY_REQUIRED_MONTHS).toBe(3);
    expect(BURN_HISTORY_FRESHNESS_DAYS).toBe(90);
    expect(ASSET_VALUATION_FRESHNESS_DAYS.investment).toBe(90);
    expect(ASSET_VALUATION_FRESHNESS_DAYS.fixed_deposit).toBe(180);
    expect(FinancialDiagnosticOverallStatusSchema.parse("setup_required")).toBe("setup_required");
  });
});

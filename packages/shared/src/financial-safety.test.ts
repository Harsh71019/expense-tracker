import { describe, expect, it } from "vitest";

import {
  ESSENTIAL_BURN_FORMULA_VERSION,
  ESSENTIAL_BURN_REQUIRED_MONTHS,
  ESSENTIAL_BURN_TIMEZONE,
  EssentialBurnClassificationSchema,
  EssentialBurnCurrentMonthSchema,
  EssentialBurnLimitationKeySchema,
  EssentialBurnMonthSchema,
  EssentialBurnObservationStatusSchema,
  EssentialBurnQualitySchema,
  EssentialBurnQuerySchema,
  EssentialBurnResponseSchema,
  RESERVE_FORMULA_VERSION,
  RESERVE_POLICY_VERSION,
  RESERVE_TIMEZONE,
  ReserveLimitationKeySchema,
  ReserveLiquidityTierSchema,
  ReserveSourceExclusionReasonSchema,
  ReserveSourceKindSchema,
  ReserveSourceSchema,
  ReserveSummaryQuerySchema,
  ReserveSummarySchema,
  ListReserveSourcesQuerySchema,
  UpdateReserveSourceSchema,
  type EssentialBurnResponse,
  type ReserveSource
} from "./financial-safety.js";

const VALID_RESPONSE_FIXTURE: EssentialBurnResponse = {
  computedAt: new Date("2026-08-18T10:00:00.000Z"),
  asOf: new Date("2026-08-18T10:00:00.000Z"),
  sourceThrough: new Date("2026-08-18T10:00:00.000Z"),
  formulaVersion: 1,
  timezone: "Asia/Kolkata",
  requiredCompleteMonths: 3,
  observedCompleteMonthCount: 3,
  averageMonthlyEssentialMinor: 250_000,
  quality: "complete",
  completeMonths: [
    {
      month: "2026-05",
      observation: "observed",
      essentialTotalMinor: 240_000,
      eligibleExpenseTransactionCount: 12,
      essentialTransactionCount: 8
    },
    {
      month: "2026-06",
      observation: "observed",
      essentialTotalMinor: 260_000,
      eligibleExpenseTransactionCount: 14,
      essentialTransactionCount: 10
    },
    {
      month: "2026-07",
      observation: "observed",
      essentialTotalMinor: 250_000,
      eligibleExpenseTransactionCount: 15,
      essentialTransactionCount: 9
    }
  ],
  currentPartialMonth: {
    month: "2026-08",
    essentialTotalMinor: 120_000,
    eligibleExpenseTransactionCount: 6,
    essentialTransactionCount: 4,
    excludedFromBaseline: true
  },
  classification: {
    eligibleExpenseTransactionCount: 41,
    essentialExpenseTransactionCount: 27,
    lifestyleExpenseTransactionCount: 12,
    uncategorizedExpenseCount: 1,
    uncategorizedExpenseMinor: 10_000,
    ungroupedExpenseCount: 1,
    ungroupedExpenseMinor: 5_000,
    categorizedExpenseMinor: 750_000,
    unclassifiedExpenseMinor: 15_000,
    coverageRatioBps: 9803,
    currentCategoryMetadataInUse: true
  },
  limitations: [
    "current_category_metadata_in_use",
    "uncategorized_expenses_present",
    "ungrouped_categories_present"
  ]
};

describe("financial-safety shared contracts", () => {
  it("validates versioned policy constants", () => {
    expect(ESSENTIAL_BURN_FORMULA_VERSION).toBe(1);
    expect(ESSENTIAL_BURN_REQUIRED_MONTHS).toBe(3);
    expect(ESSENTIAL_BURN_TIMEZONE).toBe("Asia/Kolkata");
  });

  it("validates quality states and rejects invalid values", () => {
    const valid = ["unavailable", "limited", "complete"];
    for (const q of valid) {
      expect(EssentialBurnQualitySchema.parse(q)).toBe(q);
    }
    expect(() => EssentialBurnQualitySchema.parse("ready")).toThrow();
    expect(() => EssentialBurnQualitySchema.parse("pending")).toThrow();
  });

  it("validates observation statuses", () => {
    const valid = ["observed", "missing_history"];
    for (const status of valid) {
      expect(EssentialBurnObservationStatusSchema.parse(status)).toBe(status);
    }
    expect(() => EssentialBurnObservationStatusSchema.parse("unobserved")).toThrow();
  });

  it("validates closed limitation keys and rejects unknown strings", () => {
    const valid = [
      "current_category_metadata_in_use",
      "uncategorized_expenses_present",
      "ungrouped_categories_present",
      "insufficient_history",
      "no_history",
      "partial_month_excluded"
    ];
    for (const key of valid) {
      expect(EssentialBurnLimitationKeySchema.parse(key)).toBe(key);
    }
    expect(() => EssentialBurnLimitationKeySchema.parse("arbitrary_limitation")).toThrow();
  });

  it("validates month schema and rejects invalid month formats", () => {
    const month = EssentialBurnMonthSchema.parse({
      month: "2026-05",
      observation: "observed",
      essentialTotalMinor: 100_000,
      eligibleExpenseTransactionCount: 5,
      essentialTransactionCount: 3
    });
    expect(month.month).toBe("2026-05");

    expect(() =>
      EssentialBurnMonthSchema.parse({
        month: "2026-13",
        observation: "observed",
        essentialTotalMinor: 100_000,
        eligibleExpenseTransactionCount: 5,
        essentialTransactionCount: 3
      })
    ).toThrow();

    expect(() =>
      EssentialBurnMonthSchema.parse({
        month: "2026/05",
        observation: "observed",
        essentialTotalMinor: 100_000,
        eligibleExpenseTransactionCount: 5,
        essentialTransactionCount: 3
      })
    ).toThrow();

    expect(() =>
      EssentialBurnMonthSchema.parse({
        month: "2026-05",
        observation: "observed",
        essentialTotalMinor: -1,
        eligibleExpenseTransactionCount: 5,
        essentialTransactionCount: 3
      })
    ).toThrow();
  });

  it("validates current partial month schema requiring excludedFromBaseline: true", () => {
    const current = EssentialBurnCurrentMonthSchema.parse({
      month: "2026-08",
      essentialTotalMinor: 50_000,
      eligibleExpenseTransactionCount: 2,
      essentialTransactionCount: 1,
      excludedFromBaseline: true
    });
    expect(current.excludedFromBaseline).toBe(true);

    expect(() =>
      EssentialBurnCurrentMonthSchema.parse({
        month: "2026-08",
        essentialTotalMinor: 50_000,
        eligibleExpenseTransactionCount: 2,
        essentialTransactionCount: 1,
        excludedFromBaseline: false
      })
    ).toThrow();
  });

  it("validates classification evidence schema and bounds", () => {
    const classification = EssentialBurnClassificationSchema.parse({
      eligibleExpenseTransactionCount: 10,
      essentialExpenseTransactionCount: 6,
      lifestyleExpenseTransactionCount: 4,
      uncategorizedExpenseCount: 0,
      uncategorizedExpenseMinor: 0,
      ungroupedExpenseCount: 0,
      ungroupedExpenseMinor: 0,
      categorizedExpenseMinor: 100_000,
      unclassifiedExpenseMinor: 0,
      coverageRatioBps: 10000,
      currentCategoryMetadataInUse: true
    });
    expect(classification.coverageRatioBps).toBe(10000);

    expect(() =>
      EssentialBurnClassificationSchema.parse({
        ...classification,
        coverageRatioBps: 10001
      })
    ).toThrow();

    expect(() =>
      EssentialBurnClassificationSchema.parse({
        ...classification,
        coverageRatioBps: -1
      })
    ).toThrow();

    expect(() =>
      EssentialBurnClassificationSchema.parse({
        ...classification,
        uncategorizedExpenseMinor: -500
      })
    ).toThrow();
  });

  it("validates a full valid EssentialBurnResponse payload", () => {
    const parsed = EssentialBurnResponseSchema.parse(VALID_RESPONSE_FIXTURE);
    expect(parsed.quality).toBe("complete");
    expect(parsed.averageMonthlyEssentialMinor).toBe(250_000);
    expect(parsed.completeMonths).toHaveLength(3);
    expect(parsed.currentPartialMonth.excludedFromBaseline).toBe(true);
  });

  it("validates unavailable state with null average", () => {
    const unavailablePayload = {
      ...VALID_RESPONSE_FIXTURE,
      quality: "unavailable",
      observedCompleteMonthCount: 0,
      averageMonthlyEssentialMinor: null,
      completeMonths: [
        {
          month: "2026-05",
          observation: "missing_history",
          essentialTotalMinor: 0,
          eligibleExpenseTransactionCount: 0,
          essentialTransactionCount: 0
        },
        {
          month: "2026-06",
          observation: "missing_history",
          essentialTotalMinor: 0,
          eligibleExpenseTransactionCount: 0,
          essentialTransactionCount: 0
        },
        {
          month: "2026-07",
          observation: "missing_history",
          essentialTotalMinor: 0,
          eligibleExpenseTransactionCount: 0,
          essentialTransactionCount: 0
        }
      ],
      limitations: ["current_category_metadata_in_use", "no_history"]
    };

    const parsed = EssentialBurnResponseSchema.parse(unavailablePayload);
    expect(parsed.quality).toBe("unavailable");
    expect(parsed.averageMonthlyEssentialMinor).toBeNull();
  });

  it("rejects response when completeMonths does not have exactly 3 entries", () => {
    const invalidMonths = {
      ...VALID_RESPONSE_FIXTURE,
      completeMonths: VALID_RESPONSE_FIXTURE.completeMonths.slice(0, 2)
    };
    expect(() => EssentialBurnResponseSchema.parse(invalidMonths)).toThrow();
  });

  it("rejects negative, non-integer, or overflow amounts in response", () => {
    expect(() =>
      EssentialBurnResponseSchema.parse({
        ...VALID_RESPONSE_FIXTURE,
        averageMonthlyEssentialMinor: -100
      })
    ).toThrow();

    expect(() =>
      EssentialBurnResponseSchema.parse({
        ...VALID_RESPONSE_FIXTURE,
        averageMonthlyEssentialMinor: 100.5
      })
    ).toThrow();
  });

  it("validates query schema with optional asOf", () => {
    const emptyQuery = EssentialBurnQuerySchema.parse({});
    expect(emptyQuery.asOf).toBeUndefined();

    const dateQuery = EssentialBurnQuerySchema.parse({
      asOf: "2026-08-18T10:00:00.000Z"
    });
    expect(dateQuery.asOf).toBeInstanceOf(Date);
    expect(dateQuery.asOf?.toISOString()).toBe("2026-08-18T10:00:00.000Z");

    expect(() => EssentialBurnQuerySchema.parse({ asOf: "not-a-date" })).toThrow();
  });
});

describe("emergency reserve source shared contracts", () => {
  const baseConfiguration = {
    liquidityTier: "instant" as const,
    isIncluded: true,
    eligibleCapMinor: null,
    effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
    configuredAt: new Date("2026-08-01T00:00:00.000Z")
  };

  const validAccountSource: ReserveSource = {
    sourceKind: "account",
    sourceId: "11111111-1111-4111-8111-111111111111",
    displayName: "HDFC Savings",
    sourceType: "bank",
    configuration: baseConfiguration,
    currentValueMinor: 500_000,
    valuedAt: null,
    freshness: "not_applicable",
    eligibleMinor: 500_000,
    eligibility: "eligible",
    exclusionReason: "none",
    isUnavailable: false,
    lastUpdatedAt: new Date("2026-08-01T00:00:00.000Z")
  };

  const validAssetSource: ReserveSource = {
    sourceKind: "asset",
    sourceId: "22222222-2222-4222-8222-222222222222",
    displayName: "SBI FD",
    sourceType: "fixed_deposit",
    configuration: { ...baseConfiguration, liquidityTier: "t_plus_1" },
    currentValueMinor: 1_000_000,
    valuedAt: new Date("2026-08-01T00:00:00.000Z"),
    freshness: "fresh",
    eligibleMinor: 1_000_000,
    eligibility: "eligible",
    exclusionReason: "none",
    isUnavailable: false,
    lastUpdatedAt: new Date("2026-08-01T00:00:00.000Z")
  };

  it("validates every source kind", () => {
    for (const kind of ["account", "asset"]) {
      expect(ReserveSourceKindSchema.parse(kind)).toBe(kind);
    }
    expect(() => ReserveSourceKindSchema.parse("liability")).toThrow();
  });

  it("validates every liquidity tier", () => {
    for (const tier of ["instant", "t_plus_1", "locked"]) {
      expect(ReserveLiquidityTierSchema.parse(tier)).toBe(tier);
    }
    expect(() => ReserveLiquidityTierSchema.parse("weekly")).toThrow();
  });

  it("validates every closed exclusion reason and rejects an unknown one", () => {
    const reasons = [
      "none",
      "not_configured",
      "user_excluded",
      "locked",
      "unsupported_account_type",
      "unsupported_asset_kind",
      "archived_account",
      "closed_asset",
      "missing_valuation",
      "stale_valuation",
      "non_positive_value",
      "cap_results_in_zero",
      "potential_double_count"
    ];
    for (const reason of reasons) {
      expect(ReserveSourceExclusionReasonSchema.parse(reason)).toBe(reason);
    }
    expect(() => ReserveSourceExclusionReasonSchema.parse("bank_holiday")).toThrow();
  });

  it("validates a valid account source and a valid asset source", () => {
    expect(ReserveSourceSchema.parse(validAccountSource).sourceKind).toBe("account");
    expect(ReserveSourceSchema.parse(validAssetSource).sourceKind).toBe("asset");
  });

  it("rejects a negative eligible cap", () => {
    expect(() =>
      UpdateReserveSourceSchema.parse({
        liquidityTier: "instant",
        isIncluded: true,
        eligibleCapMinor: -1
      })
    ).toThrow();
  });

  it("rejects a fractional eligible cap", () => {
    expect(() =>
      UpdateReserveSourceSchema.parse({
        liquidityTier: "instant",
        isIncluded: true,
        eligibleCapMinor: 100.5
      })
    ).toThrow();
  });

  it("rejects an unsafe (beyond MAX_SAFE_INTEGER) eligible cap", () => {
    expect(() =>
      UpdateReserveSourceSchema.parse({
        liquidityTier: "instant",
        isIncluded: true,
        eligibleCapMinor: Number.MAX_SAFE_INTEGER + 10
      })
    ).toThrow();
  });

  it("rejects a zero eligible cap", () => {
    expect(() =>
      UpdateReserveSourceSchema.parse({
        liquidityTier: "instant",
        isIncluded: true,
        eligibleCapMinor: 0
      })
    ).toThrow();
  });

  it("accepts an UpdateReserveSource without a cap", () => {
    const parsed = UpdateReserveSourceSchema.parse({
      liquidityTier: "locked",
      isIncluded: false
    });
    expect(parsed.eligibleCapMinor).toBeUndefined();
  });

  it("rejects an invalid cursor limit below 1 or above 200", () => {
    expect(() => ListReserveSourcesQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() => ListReserveSourcesQuerySchema.parse({ limit: 201 })).toThrow();
  });

  it("defaults the list query limit to 50", () => {
    expect(ListReserveSourcesQuerySchema.parse({}).limit).toBe(50);
  });

  it("coerces and rejects malformed asOf dates on the reserve summary query", () => {
    const parsed = ReserveSummaryQuerySchema.parse({ asOf: "2026-08-18T00:00:00.000Z" });
    expect(parsed.asOf).toBeInstanceOf(Date);
    expect(() => ReserveSummaryQuerySchema.parse({ asOf: "not-a-date" })).toThrow();
  });

  it("rejects an unknown limitation key on the summary", () => {
    expect(() => ReserveLimitationKeySchema.parse("arbitrary_limitation")).toThrow();
  });

  it("requires the aggregate's money totals to be safe, non-negative integers", () => {
    const validSummary = {
      computedAt: new Date(),
      asOf: new Date(),
      sourceThrough: new Date(),
      formulaVersion: RESERVE_FORMULA_VERSION,
      policyVersion: RESERVE_POLICY_VERSION,
      timezone: RESERVE_TIMEZONE,
      configuredSourceCount: 1,
      currentlyEligibleSourceCount: 1,
      instantMinor: 100_000,
      tPlusOneMinor: 0,
      totalEligibleMinor: 100_000,
      lockedMinor: 0,
      staleExcludedMinor: 0,
      missingValueSourceCount: 0,
      staleSourceCount: 0,
      excludedSourceCount: 0,
      limitations: []
    };
    expect(ReserveSummarySchema.parse(validSummary).totalEligibleMinor).toBe(100_000);

    expect(() => ReserveSummarySchema.parse({ ...validSummary, instantMinor: -1 })).toThrow();
    expect(() => ReserveSummarySchema.parse({ ...validSummary, instantMinor: 1.5 })).toThrow();
    expect(() =>
      ReserveSummarySchema.parse({
        ...validSummary,
        instantMinor: Number.MAX_SAFE_INTEGER + 10
      })
    ).toThrow();
  });

  it("rejects a timezone other than the fixed Asia/Kolkata literal", () => {
    const summary = {
      computedAt: new Date(),
      asOf: new Date(),
      sourceThrough: new Date(),
      formulaVersion: 1,
      policyVersion: 1,
      timezone: "UTC",
      configuredSourceCount: 0,
      currentlyEligibleSourceCount: 0,
      instantMinor: 0,
      tPlusOneMinor: 0,
      totalEligibleMinor: 0,
      lockedMinor: 0,
      staleExcludedMinor: 0,
      missingValueSourceCount: 0,
      staleSourceCount: 0,
      excludedSourceCount: 0,
      limitations: []
    };
    expect(() => ReserveSummarySchema.parse(summary)).toThrow();
  });
});

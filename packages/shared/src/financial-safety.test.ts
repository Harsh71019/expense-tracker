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
  type EssentialBurnResponse
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

import { describe, expect, it } from "vitest";

import {
  CashflowForecastQuerySchema,
  CashflowForecastSnapshotSchema,
  type CashflowForecastSnapshot
} from "./cashflow-forecast.js";

describe("CashflowForecastQuerySchema", () => {
  it("defaults to 30 days when query is empty or undefined", () => {
    expect(CashflowForecastQuerySchema.parse({})).toEqual({ days: 30 });
    expect(CashflowForecastQuerySchema.parse({ days: undefined })).toEqual({ days: 30 });
  });

  it("coerces string query values from Express into numbers", () => {
    expect(CashflowForecastQuerySchema.parse({ days: "30" })).toEqual({ days: 30 });
    expect(CashflowForecastQuerySchema.parse({ days: "60" })).toEqual({ days: 60 });
    expect(CashflowForecastQuerySchema.parse({ days: "90" })).toEqual({ days: 90 });
  });

  it("accepts numeric literal values", () => {
    expect(CashflowForecastQuerySchema.parse({ days: 30 })).toEqual({ days: 30 });
    expect(CashflowForecastQuerySchema.parse({ days: 60 })).toEqual({ days: 60 });
    expect(CashflowForecastQuerySchema.parse({ days: 90 })).toEqual({ days: 90 });
  });

  it("handles single-item array values from URL query parsers", () => {
    expect(CashflowForecastQuerySchema.parse({ days: ["60"] })).toEqual({ days: 60 });
    expect(CashflowForecastQuerySchema.parse({ days: [90] })).toEqual({ days: 90 });
  });

  it("rejects unsupported horizons", () => {
    expect(() => CashflowForecastQuerySchema.parse({ days: "45" })).toThrow();
    expect(() => CashflowForecastQuerySchema.parse({ days: 15 })).toThrow();
    expect(() => CashflowForecastQuerySchema.parse({ days: "invalid" })).toThrow();
    expect(() => CashflowForecastQuerySchema.parse({ days: -30 })).toThrow();
    expect(() => CashflowForecastQuerySchema.parse({ days: 0 })).toThrow();
  });
});

describe("CashflowForecastSnapshotSchema", () => {
  const sampleSnapshot: CashflowForecastSnapshot = {
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    asOf: new Date("2026-08-16T00:00:00.000Z"),
    horizonDays: 30,
    modelVersion: 1,
    inputWatermark: {
      asOf: new Date("2026-08-16T00:00:00.000Z"),
      latestOccurredAt: new Date("2026-08-15T00:00:00.000Z"),
      latestUpdatedAt: new Date("2026-08-15T00:00:00.000Z"),
      rowCount: 60,
      digest: "a".repeat(64)
    },
    sufficiency: { status: "sufficient", observationCount: 60, minimumRequired: 35 },
    resources: {
      rowsScanned: 60,
      runtimeMs: 3,
      rowBudgetHit: false,
      timedOut: false,
      outcome: { status: "completed" }
    },
    model: "trailing_median",
    pointBalanceMinor: 12_500,
    range: {
      lowerMinor: 8_000,
      upperMinor: 15_000,
      observedCoverageBps: 8_500,
      label: "historical_range"
    },
    assumptions: {
      liquidBalanceMinor: 10_000,
      knownRecurringInflowMinor: 8_000,
      knownRecurringOutflowMinor: 3_000,
      creditCardBillsDueMinor: 1_500,
      excludedCreditCardPurchaseCount: 1,
      excludedTransferCount: 1,
      variableSpendExcludedRecurringCount: 2,
      asOfDeterministic: true
    },
    metrics: {
      evaluatedOriginCount: 8,
      maeMinor: 500,
      maseBps: null,
      baselineMaeMinor: null,
      residualCount: 8,
      observedCoverageBps: 8_500,
      eligibleForHorizon: true
    },
    shortfall: {
      hasPotentialShortfall: false,
      firstPotentialShortfallDate: null,
      conservativeBalanceMinor: 8_000,
      mode: "read_only"
    },
    computedAt: new Date("2026-08-16T01:00:00.000Z")
  };

  it("parses valid snapshot object with Date instances", () => {
    const parsed = CashflowForecastSnapshotSchema.parse(sampleSnapshot);
    expect(parsed.id).toBe(sampleSnapshot.id);
    expect(parsed.asOf).toBeInstanceOf(Date);
    expect(parsed.computedAt).toBeInstanceOf(Date);
    expect(parsed.inputWatermark.latestOccurredAt).toBeInstanceOf(Date);
  });

  it("coerces ISO strings from JSON round-trip into Date instances", () => {
    const json: unknown = JSON.parse(JSON.stringify(sampleSnapshot));
    const parsed = CashflowForecastSnapshotSchema.parse(json);
    expect(parsed.asOf).toBeInstanceOf(Date);
    expect(parsed.asOf.toISOString()).toBe("2026-08-16T00:00:00.000Z");
    expect(parsed.computedAt).toBeInstanceOf(Date);
    expect(parsed.inputWatermark.latestOccurredAt).toBeInstanceOf(Date);
  });

  it("rejects when range lowerMinor exceeds upperMinor", () => {
    expect(() =>
      CashflowForecastSnapshotSchema.parse({
        ...sampleSnapshot,
        range: {
          ...sampleSnapshot.range,
          lowerMinor: 20_000,
          upperMinor: 10_000
        }
      })
    ).toThrow();
  });
});

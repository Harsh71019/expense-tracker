import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../../auth/auth.guard.js";
import { ForecastingController } from "../forecasting.controller.js";

describe("ForecastingController", () => {
  const user: AuthenticatedUser = { id: "user-123" };

  const mockSnapshot = {
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    asOf: new Date("2026-08-16T00:00:00.000Z"),
    horizonDays: 30 as const,
    modelVersion: 1,
    inputWatermark: {
      asOf: new Date("2026-08-16T00:00:00.000Z"),
      latestOccurredAt: new Date("2026-08-15T00:00:00.000Z"),
      latestUpdatedAt: new Date("2026-08-15T00:00:00.000Z"),
      rowCount: 60,
      digest: "a".repeat(64)
    },
    sufficiency: { status: "sufficient" as const, observationCount: 60, minimumRequired: 35 },
    resources: {
      rowsScanned: 60,
      runtimeMs: 3,
      rowBudgetHit: false,
      timedOut: false,
      outcome: { status: "completed" as const }
    },
    model: "trailing_median" as const,
    pointBalanceMinor: 12_500,
    range: {
      lowerMinor: 8_000,
      upperMinor: 15_000,
      observedCoverageBps: 8_500,
      label: "historical_range" as const
    },
    assumptions: {
      liquidBalanceMinor: 10_000,
      knownRecurringInflowMinor: 8_000,
      knownRecurringOutflowMinor: 3_000,
      creditCardBillsDueMinor: 1_500,
      excludedCreditCardPurchaseCount: 1,
      excludedTransferCount: 1,
      variableSpendExcludedRecurringCount: 2,
      asOfDeterministic: true as const
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
      mode: "read_only" as const
    },
    computedAt: new Date("2026-08-16T01:00:00.000Z")
  };

  it("coerces string days parameter from HTTP query and delegates to service", async () => {
    const mockService = {
      getLatest: vi.fn().mockResolvedValue(mockSnapshot)
    };

    // @ts-expect-error - mock ForecastingService for unit testing
    const controller = new ForecastingController(mockService);
    const result = await controller.getForecast(user, { days: "30" });

    expect(result).toBe(mockSnapshot);
    expect(mockService.getLatest).toHaveBeenCalledWith("user-123", 30);
  });

  it("supports 60 and 90-day string queries", async () => {
    const mockService = {
      getLatest: vi.fn().mockResolvedValue(null)
    };

    // @ts-expect-error - mock ForecastingService for unit testing
    const controller = new ForecastingController(mockService);
    await controller.getForecast(user, { days: "60" });
    expect(mockService.getLatest).toHaveBeenCalledWith("user-123", 60);

    await controller.getForecast(user, { days: "90" });
    expect(mockService.getLatest).toHaveBeenCalledWith("user-123", 90);
  });

  it("defaults to 30 days when query is empty", async () => {
    const mockService = {
      getLatest: vi.fn().mockResolvedValue(null)
    };

    // @ts-expect-error - mock ForecastingService for unit testing
    const controller = new ForecastingController(mockService);
    await controller.getForecast(user, {});
    expect(mockService.getLatest).toHaveBeenCalledWith("user-123", 30);
  });

  it("accepts numeric literals", async () => {
    const mockService = {
      getLatest: vi.fn().mockResolvedValue(null)
    };

    // @ts-expect-error - mock ForecastingService for unit testing
    const controller = new ForecastingController(mockService);
    await controller.getForecast(user, { days: 30 });
    expect(mockService.getLatest).toHaveBeenCalledWith("user-123", 30);
  });

  it("throws validation error for invalid horizons", async () => {
    const mockService = {
      getLatest: vi.fn().mockResolvedValue(null)
    };

    // @ts-expect-error - mock ForecastingService for unit testing
    const controller = new ForecastingController(mockService);
    await expect(controller.getForecast(user, { days: "45" })).rejects.toThrow();
  });
});

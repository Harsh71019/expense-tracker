import { describe, expect, it, vi } from "vitest";
import type { EssentialBurnResponse } from "@treasury-ops/shared";

import { FinancialSafetyController } from "../financial-safety.controller.js";

describe("FinancialSafetyController", () => {
  const mockResponse: EssentialBurnResponse = {
    computedAt: new Date("2026-08-18T10:00:00.000Z"),
    asOf: new Date("2026-08-18T10:00:00.000Z"),
    sourceThrough: new Date("2026-08-18T10:00:00.000Z"),
    formulaVersion: 1,
    timezone: "Asia/Kolkata",
    requiredCompleteMonths: 3,
    observedCompleteMonthCount: 3,
    averageMonthlyEssentialMinor: 50_000,
    quality: "complete",
    completeMonths: [
      {
        month: "2026-05",
        observation: "observed",
        essentialTotalMinor: 50_000,
        eligibleExpenseTransactionCount: 5,
        essentialTransactionCount: 3
      },
      {
        month: "2026-06",
        observation: "observed",
        essentialTotalMinor: 50_000,
        eligibleExpenseTransactionCount: 5,
        essentialTransactionCount: 3
      },
      {
        month: "2026-07",
        observation: "observed",
        essentialTotalMinor: 50_000,
        eligibleExpenseTransactionCount: 5,
        essentialTransactionCount: 3
      }
    ],
    currentPartialMonth: {
      month: "2026-08",
      essentialTotalMinor: 20_000,
      eligibleExpenseTransactionCount: 2,
      essentialTransactionCount: 1,
      excludedFromBaseline: true
    },
    classification: {
      eligibleExpenseTransactionCount: 15,
      essentialExpenseTransactionCount: 9,
      lifestyleExpenseTransactionCount: 6,
      uncategorizedExpenseCount: 0,
      uncategorizedExpenseMinor: 0,
      ungroupedExpenseCount: 0,
      ungroupedExpenseMinor: 0,
      categorizedExpenseMinor: 150_000,
      unclassifiedExpenseMinor: 0,
      coverageRatioBps: 10000,
      currentCategoryMetadataInUse: true
    },
    limitations: ["current_category_metadata_in_use"]
  };

  it("calls service with user.id and undefined asOf when no query parameter is provided", async () => {
    const mockService = {
      getEssentialBurn: vi.fn().mockResolvedValue(mockResponse)
    };

    // @ts-expect-error - mock EssentialBurnService for unit testing
    const controller = new FinancialSafetyController(mockService);
    const user = { id: "user-123", email: "test@example.com" };

    const result = await controller.getEssentialBurn(user, {});

    expect(mockService.getEssentialBurn).toHaveBeenCalledWith("user-123");
    expect(result).toBe(mockResponse);
  });

  it("parses and passes valid ISO asOf query parameter", async () => {
    const mockService = {
      getEssentialBurn: vi.fn().mockResolvedValue(mockResponse)
    };

    // @ts-expect-error - mock EssentialBurnService for unit testing
    const controller = new FinancialSafetyController(mockService);
    const user = { id: "user-123", email: "test@example.com" };

    const result = await controller.getEssentialBurn(user, {
      asOf: "2026-07-15T00:00:00.000Z"
    });

    expect(mockService.getEssentialBurn).toHaveBeenCalledWith(
      "user-123",
      new Date("2026-07-15T00:00:00.000Z")
    );
    expect(result).toBe(mockResponse);
  });

  it("rejects invalid asOf date parameter with ZodError", () => {
    const mockService = {
      getEssentialBurn: vi.fn()
    };

    // @ts-expect-error - mock EssentialBurnService for unit testing
    const controller = new FinancialSafetyController(mockService);
    const user = { id: "user-123", email: "test@example.com" };

    expect(() => controller.getEssentialBurn(user, { asOf: "invalid-date" })).toThrow();
    expect(mockService.getEssentialBurn).not.toHaveBeenCalled();
  });
});

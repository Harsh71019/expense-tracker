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

  const user = { id: "user-123", email: "test@example.com" };

  it("calls service with user.id and undefined asOf when no query parameter is provided", async () => {
    const mockService = {
      getEssentialBurn: vi.fn().mockResolvedValue(mockResponse)
    };

    // @ts-expect-error - mock services for unit testing
    const controller = new FinancialSafetyController(mockService, {}, {});

    const result = await controller.getEssentialBurn(user, {});

    expect(mockService.getEssentialBurn).toHaveBeenCalledWith("user-123");
    expect(result).toBe(mockResponse);
  });

  it("parses and passes valid ISO asOf query parameter", async () => {
    const mockService = {
      getEssentialBurn: vi.fn().mockResolvedValue(mockResponse)
    };

    // @ts-expect-error - mock services for unit testing
    const controller = new FinancialSafetyController(mockService, {}, {});

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

    // @ts-expect-error - mock services for unit testing
    const controller = new FinancialSafetyController(mockService, {}, {});

    expect(() => controller.getEssentialBurn(user, { asOf: "invalid-date" })).toThrow();
    expect(mockService.getEssentialBurn).not.toHaveBeenCalled();
  });

  describe("reserve sources", () => {
    const mockSource = {
      sourceKind: "account" as const,
      sourceId: "11111111-1111-4111-8111-111111111111",
      displayName: "HDFC Savings",
      sourceType: "bank" as const,
      configuration: {
        liquidityTier: "instant" as const,
        isIncluded: true,
        eligibleCapMinor: null,
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
        configuredAt: new Date("2026-08-01T00:00:00.000Z")
      },
      currentValueMinor: 100_000,
      valuedAt: null,
      freshness: "not_applicable" as const,
      eligibleMinor: 100_000,
      eligibility: "eligible" as const,
      exclusionReason: "none" as const,
      isUnavailable: false,
      lastUpdatedAt: new Date("2026-08-01T00:00:00.000Z")
    };

    it("lists reserve sources with parsed query defaults", async () => {
      const mockValueService = {
        listSources: vi.fn().mockResolvedValue({
          items: [mockSource],
          pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
        })
      };

      // @ts-expect-error - mock services for unit testing
      const controller = new FinancialSafetyController({}, {}, mockValueService);
      const result = await controller.listReserveSources(user, {});

      expect(mockValueService.listSources).toHaveBeenCalledWith(
        "user-123",
        expect.objectContaining({ limit: 50 })
      );
      expect(result.items).toEqual([mockSource]);
    });

    it("rejects a limit above 200", () => {
      const mockValueService = { listSources: vi.fn() };
      // @ts-expect-error - mock services for unit testing
      const controller = new FinancialSafetyController({}, {}, mockValueService);
      expect(() => controller.listReserveSources(user, { limit: "500" })).toThrow();
      expect(mockValueService.listSources).not.toHaveBeenCalled();
    });

    it("updates a reserve source, parsing sourceKind/sourceId/body/Idempotency-Key", async () => {
      const mockSourceService = {
        updateSource: vi.fn().mockResolvedValue({ replayed: false, result: mockSource })
      };
      // @ts-expect-error - mock services for unit testing
      const controller = new FinancialSafetyController({}, mockSourceService, {});
      const responseMock = { status: vi.fn().mockReturnThis(), setHeader: vi.fn() };

      const result = await controller.updateReserveSource(
        user,
        "account",
        mockSource.sourceId,
        { liquidityTier: "instant", isIncluded: true },
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        // @ts-expect-error - partial Response mock
        responseMock
      );

      expect(mockSourceService.updateSource).toHaveBeenCalledWith(
        "user-123",
        "account",
        mockSource.sourceId,
        { liquidityTier: "instant", isIncluded: true },
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      );
      expect(result).toBe(mockSource);
      expect(responseMock.status).not.toHaveBeenCalled();
    });

    it("marks a replayed update with the Idempotency-Replayed header", async () => {
      const mockSourceService = {
        updateSource: vi.fn().mockResolvedValue({ replayed: true, result: mockSource })
      };
      // @ts-expect-error - mock services for unit testing
      const controller = new FinancialSafetyController({}, mockSourceService, {});
      const responseMock = { status: vi.fn().mockReturnThis(), setHeader: vi.fn() };

      await controller.updateReserveSource(
        user,
        "account",
        mockSource.sourceId,
        { liquidityTier: "instant", isIncluded: true },
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        // @ts-expect-error - partial Response mock
        responseMock
      );

      expect(responseMock.status).toHaveBeenCalledWith(200);
      expect(responseMock.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
    });

    it("rejects a missing Idempotency-Key header", async () => {
      const mockSourceService = { updateSource: vi.fn() };
      // @ts-expect-error - mock services for unit testing
      const controller = new FinancialSafetyController({}, mockSourceService, {});

      await expect(
        controller.updateReserveSource(
          user,
          "account",
          mockSource.sourceId,
          { liquidityTier: "instant", isIncluded: true },
          undefined,
          // @ts-expect-error - unused Response mock
          {}
        )
      ).rejects.toThrow();
      expect(mockSourceService.updateSource).not.toHaveBeenCalled();
    });

    it("rejects an invalid sourceKind path parameter", async () => {
      const mockSourceService = { updateSource: vi.fn() };
      // @ts-expect-error - mock services for unit testing
      const controller = new FinancialSafetyController({}, mockSourceService, {});

      await expect(
        controller.updateReserveSource(
          user,
          "not_a_kind",
          mockSource.sourceId,
          { liquidityTier: "instant", isIncluded: true },
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          // @ts-expect-error - unused Response mock
          {}
        )
      ).rejects.toThrow();
      expect(mockSourceService.updateSource).not.toHaveBeenCalled();
    });

    it("rejects a non-UUID sourceId path parameter", async () => {
      const mockSourceService = { updateSource: vi.fn() };
      // @ts-expect-error - mock services for unit testing
      const controller = new FinancialSafetyController({}, mockSourceService, {});

      await expect(
        controller.updateReserveSource(
          user,
          "account",
          "not-a-uuid",
          { liquidityTier: "instant", isIncluded: true },
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          // @ts-expect-error - unused Response mock
          {}
        )
      ).rejects.toThrow();
      expect(mockSourceService.updateSource).not.toHaveBeenCalled();
    });

    it("rejects an invalid request body", async () => {
      const mockSourceService = { updateSource: vi.fn() };
      // @ts-expect-error - mock services for unit testing
      const controller = new FinancialSafetyController({}, mockSourceService, {});

      await expect(
        controller.updateReserveSource(
          user,
          "account",
          mockSource.sourceId,
          { liquidityTier: "not_a_tier" },
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          // @ts-expect-error - unused Response mock
          {}
        )
      ).rejects.toThrow();
      expect(mockSourceService.updateSource).not.toHaveBeenCalled();
    });

    it("returns the reserves aggregate for the current user", async () => {
      const mockAggregate = { totalEligibleMinor: 100_000 };
      const mockValueService = { getSummary: vi.fn().mockResolvedValue(mockAggregate) };
      // @ts-expect-error - mock services for unit testing
      const controller = new FinancialSafetyController({}, {}, mockValueService);

      const result = await controller.getReserves(user, {});
      expect(mockValueService.getSummary).toHaveBeenCalledWith("user-123");
      expect(result).toBe(mockAggregate);
    });

    it("passes an explicit asOf through to getReserves", async () => {
      const mockValueService = { getSummary: vi.fn().mockResolvedValue({}) };
      // @ts-expect-error - mock services for unit testing
      const controller = new FinancialSafetyController({}, {}, mockValueService);

      await controller.getReserves(user, { asOf: "2026-07-15T00:00:00.000Z" });
      expect(mockValueService.getSummary).toHaveBeenCalledWith(
        "user-123",
        new Date("2026-07-15T00:00:00.000Z")
      );
    });
  });
});

import {
  type FinancialProfileState,
  type ProtectionState,
  type SafetyBufferState,
  type DeclaredDebtPage
} from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import type { AccountDiagnosticFacts } from "../../accounts/account-diagnostic-read.service.js";
import type { AssetDiagnosticFacts } from "../../assets/asset-diagnostic-read.service.js";
import type { CategoryDiagnosticFacts } from "../../categories/category-diagnostic-read.service.js";
import type { GoalDiagnosticFacts } from "../../goals/goal-diagnostic-read.service.js";
import type { LedgerHistoryDiagnosticFacts } from "../../transactions/ledger-history-diagnostic-read.service.js";
import { FinancialDiagnosticService } from "../financial-diagnostic.service.js";

const ASOF = new Date("2026-08-18T10:00:00.000Z");

describe("FinancialDiagnosticService", () => {
  it("orchestrates concurrent reads and logs structured metrics without money values", async () => {
    const loggerMock = {
      log: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    const mockAccountFacts: AccountDiagnosticFacts = {
      activeCount: 1,
      nonCreditCardCount: 1,
      creditCardCount: 0,
      creditCardOnly: false,
      liquidCount: 1,
      lastUpdatedAt: ASOF
    };

    const mockCategoryFacts: CategoryDiagnosticFacts = {
      activeExpenseCategoryCount: 2,
      essentialExpenseCategoryCount: 1,
      totalActiveCategoryCount: 3,
      lastUpdatedAt: ASOF
    };

    const mockLedgerFacts: LedgerHistoryDiagnosticFacts = {
      completeMonthCount: 3,
      qualifyingTransactionCount: 10,
      latestExpenseAt: ASOF,
      oldestExpenseAt: new Date("2026-05-01T00:00:00.000Z"),
      months: ["2026-05", "2026-06", "2026-07"],
      hasCurrentMonthExpenses: true
    };

    const mockAssetFacts: AssetDiagnosticFacts = {
      activeAssetCount: 0,
      missingValuationCount: 0,
      staleValuationCount: 0,
      latestValuationAt: null,
      hasActiveAssets: false,
      lastUpdatedAt: null
    };

    const mockGoalFacts: GoalDiagnosticFacts = {
      activeGoalCount: 0,
      totalGoalCount: 0,
      hasActiveGoals: false,
      lastUpdatedAt: null
    };

    const mockProfileState: FinancialProfileState = {
      configured: true,
      profile: {
        userId: "user-1",
        monthlyWorkMinutes: 9600,
        salaryCreditDay: 1,
        expectedAnnualIncrementBps: null,
        incomeStability: "stable",
        createdAt: ASOF,
        updatedAt: ASOF
      },
      currentSalaryVersion: {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
        netMonthlySalaryMinor: 10_00_000,
        annualCtcMinor: null,
        effectiveFrom: ASOF,
        source: "manually_confirmed",
        createdAt: ASOF
      },
      upcomingSalaryVersion: null,
      suggestedMonthlyWorkMinutes: 9600,
      asOf: ASOF
    };

    const mockProtectionState: ProtectionState = {
      configured: false,
      currentSnapshot: null,
      upcomingSnapshot: null,
      asOf: ASOF,
      dataQuality: "unavailable",
      termCover: {
        state: "not_configured",
        expiryState: "not_applicable",
        expiresOn: null,
        hasIndependentCover: false,
        hasEmployerCover: false
      },
      healthCover: {
        state: "not_configured",
        expiryState: "not_applicable",
        expiresOn: null,
        hasIndependentCover: false,
        hasEmployerCover: false
      },
      expiringSoonDays: 90,
      limitations: []
    };

    const mockDebts: DeclaredDebtPage = {
      items: [],
      pageInfo: { hasMore: false, nextCursor: null, limit: 200 },
      highCost: {
        thresholdBps: 1200,
        comparison: "greater_than",
        highCostCount: 0
      }
    };

    const mockSafetyBuffer: SafetyBufferState = {
      preference: null,
      isFallback: true,
      fallbackPolicy: "zero_balance_default",
      targetMinor: 0,
      liquidBalanceMinor: 100_000,
      bufferGapMinor: 0,
      bufferSurplusMinor: 0,
      monthlyEssentialOutflowMinor: 0
    };

    const accountsService = {
      getAccountDiagnosticFacts: vi.fn().mockResolvedValue(mockAccountFacts)
    };
    const categoriesService = {
      getCategoryDiagnosticFacts: vi.fn().mockResolvedValue(mockCategoryFacts)
    };
    const ledgerHistoryService = {
      getLedgerHistoryDiagnosticFacts: vi.fn().mockResolvedValue(mockLedgerFacts)
    };
    const assetService = {
      getAssetDiagnosticFacts: vi.fn().mockResolvedValue(mockAssetFacts)
    };
    const goalService = {
      getGoalDiagnosticFacts: vi.fn().mockResolvedValue(mockGoalFacts)
    };
    const profileService = {
      getState: vi.fn().mockResolvedValue(mockProfileState)
    };
    const protectionService = {
      getState: vi.fn().mockResolvedValue(mockProtectionState)
    };
    const debtService = {
      list: vi.fn().mockResolvedValue(mockDebts)
    };
    const safetyBufferService = {
      getState: vi.fn().mockResolvedValue(mockSafetyBuffer)
    };
    const reserveSourceService = {
      getReserveSourceDiagnosticFacts: vi.fn().mockResolvedValue({
        hasCandidates: false,
        configuredSourceCount: 0,
        currentlyEligibleSourceCount: 0,
        missingOrStaleConfiguredCount: 0,
        lastUpdatedAt: null
      })
    };

    const service = new FinancialDiagnosticService(
      loggerMock,
      // @ts-expect-error - mock services for unit testing
      accountsService,
      categoriesService,
      ledgerHistoryService,
      assetService,
      goalService,
      profileService,
      protectionService,
      debtService,
      safetyBufferService,
      reserveSourceService
    );

    const result = await service.getDiagnostic("user-1", ASOF);

    expect(result.items.length).toBe(12);
    expect(reserveSourceService.getReserveSourceDiagnosticFacts).toHaveBeenCalledWith(
      "user-1",
      ASOF
    );
    expect(accountsService.getAccountDiagnosticFacts).toHaveBeenCalledWith("user-1");
    expect(categoriesService.getCategoryDiagnosticFacts).toHaveBeenCalledWith("user-1");
    expect(ledgerHistoryService.getLedgerHistoryDiagnosticFacts).toHaveBeenCalledWith(
      "user-1",
      ASOF
    );
    expect(assetService.getAssetDiagnosticFacts).toHaveBeenCalledWith("user-1", ASOF);
    expect(goalService.getGoalDiagnosticFacts).toHaveBeenCalledWith("user-1");
    expect(profileService.getState).toHaveBeenCalledWith("user-1", ASOF);
    expect(protectionService.getState).toHaveBeenCalledWith("user-1", ASOF);
    expect(debtService.list).toHaveBeenCalledWith("user-1", { status: "active", limit: 200 });
    expect(safetyBufferService.getState).toHaveBeenCalledWith("user-1", ASOF);

    expect(loggerMock.log).toHaveBeenCalled();
    const firstCall = loggerMock.log.mock.calls[0];
    expect(firstCall).toBeDefined();
    const logPayload = firstCall?.[0];
    expect(logPayload).toHaveProperty("event", "financial_diagnostic.evaluated");
    expect(logPayload).toHaveProperty("userId", "user-1");
    expect(logPayload).not.toHaveProperty("salaryMinor");
    expect(logPayload).not.toHaveProperty("netMonthlySalaryMinor");
    expect(logPayload).not.toHaveProperty("balanceMinor");
  });

  it("bubbles up infrastructure failures without converting them to missing data", async () => {
    const loggerMock = { log: vi.fn(), error: vi.fn() };
    const failingService = {
      getAccountDiagnosticFacts: vi.fn().mockRejectedValue(new Error("Database connection lost"))
    };

    const service = new FinancialDiagnosticService(
      loggerMock,
      // @ts-expect-error - mock services for unit testing
      failingService,
      { getCategoryDiagnosticFacts: vi.fn().mockResolvedValue({}) },
      { getLedgerHistoryDiagnosticFacts: vi.fn().mockResolvedValue({}) },
      { getAssetDiagnosticFacts: vi.fn().mockResolvedValue({}) },
      { getGoalDiagnosticFacts: vi.fn().mockResolvedValue({}) },
      { getState: vi.fn().mockResolvedValue({}) },
      { getState: vi.fn().mockResolvedValue({}) },
      { list: vi.fn().mockResolvedValue({}) },
      { getState: vi.fn().mockResolvedValue({}) },
      { getReserveSourceDiagnosticFacts: vi.fn().mockResolvedValue({}) }
    );

    await expect(service.getDiagnostic("user-1", ASOF)).rejects.toThrow("Database connection lost");
  });

  it("pages through multiple active debt pages when hasMore is true", async () => {
    const loggerMock = { log: vi.fn(), error: vi.fn() };
    const debt1 = {
      id: "debt-1",
      userId: "user-1",
      name: "Credit Card 1",
      kind: "credit_card",
      status: "active" as const,
      amountSource: "declared" as const,
      isEstimate: true,
      isHighCost: true,
      declaredOutstandingMinor: 50_000,
      annualRateBps: 3600,
      monthlyPaymentMinor: null,
      notes: null,
      assetId: null,
      assetValuationStale: false,
      resolvedAt: null,
      createdAt: ASOF,
      updatedAt: ASOF
    };
    const debt2 = {
      id: "debt-2",
      userId: "user-1",
      name: "Personal Loan",
      kind: "personal_loan",
      status: "active" as const,
      amountSource: "declared" as const,
      isEstimate: true,
      isHighCost: false,
      declaredOutstandingMinor: 100_000,
      annualRateBps: 1000,
      monthlyPaymentMinor: null,
      notes: null,
      assetId: null,
      assetValuationStale: false,
      resolvedAt: null,
      createdAt: ASOF,
      updatedAt: ASOF
    };

    const debtServiceMock = {
      list: vi
        .fn()
        .mockResolvedValueOnce({
          items: [debt1],
          pageInfo: { nextCursor: "debt-1", hasMore: true, limit: 1 },
          highCost: { thresholdBps: 1200, comparison: "greater_than", highCostCount: 1 }
        })
        .mockResolvedValueOnce({
          items: [debt2],
          pageInfo: { nextCursor: null, hasMore: false, limit: 1 },
          highCost: { thresholdBps: 1200, comparison: "greater_than", highCostCount: 0 }
        })
    };

    const service = new FinancialDiagnosticService(
      loggerMock,
      // @ts-expect-error - mock services for unit testing
      {
        getAccountDiagnosticFacts: vi.fn().mockResolvedValue({
          activeCount: 0,
          nonCreditCardCount: 0,
          creditCardCount: 0,
          creditCardOnly: false,
          liquidCount: 0,
          lastUpdatedAt: null
        })
      },
      {
        getCategoryDiagnosticFacts: vi.fn().mockResolvedValue({
          activeExpenseCategoryCount: 0,
          essentialExpenseCategoryCount: 0,
          totalActiveCategoryCount: 0,
          lastUpdatedAt: null
        })
      },
      {
        getLedgerHistoryDiagnosticFacts: vi.fn().mockResolvedValue({
          completeMonthCount: 0,
          qualifyingTransactionCount: 0,
          latestExpenseAt: null,
          oldestExpenseAt: null
        })
      },
      {
        getAssetDiagnosticFacts: vi.fn().mockResolvedValue({
          activeAssetCount: 0,
          missingValuationCount: 0,
          staleValuationCount: 0,
          latestValuationAt: null,
          hasActiveAssets: false,
          lastUpdatedAt: null
        })
      },
      {
        getGoalDiagnosticFacts: vi.fn().mockResolvedValue({
          activeGoalCount: 0,
          targetDatedGoalCount: 0,
          hasEmergencyFundGoal: false,
          lastUpdatedAt: null
        })
      },
      {
        getState: vi.fn().mockResolvedValue({
          configured: false,
          profile: null,
          currentSalaryVersion: null,
          upcomingSalaryVersion: null,
          suggestedMonthlyWorkMinutes: 9600,
          asOf: ASOF
        })
      },
      {
        getState: vi.fn().mockResolvedValue({
          configured: false,
          currentSnapshot: null,
          upcomingSnapshot: null,
          asOf: ASOF,
          dataQuality: "unavailable",
          termCover: {
            state: "not_configured",
            expiryState: "not_applicable",
            expiresOn: null,
            hasIndependentCover: false,
            hasEmployerCover: false
          },
          healthCover: {
            state: "not_configured",
            expiryState: "not_applicable",
            expiresOn: null,
            hasIndependentCover: false,
            hasEmployerCover: false
          },
          expiringSoonDays: 90,
          limitations: []
        })
      },
      debtServiceMock,
      {
        getState: vi.fn().mockResolvedValue({
          isFallback: true,
          fallbackPolicy: "zero_balance_default",
          targetMinor: 0,
          liquidBalanceMinor: 0,
          bufferGapMinor: 0,
          bufferSurplusMinor: 0,
          monthlyEssentialOutflowMinor: 0
        })
      },
      {
        getReserveSourceDiagnosticFacts: vi.fn().mockResolvedValue({
          hasCandidates: false,
          configuredSourceCount: 0,
          currentlyEligibleSourceCount: 0,
          missingOrStaleConfiguredCount: 0,
          lastUpdatedAt: null
        })
      }
    );

    const diagnostic = await service.getDiagnostic("user-1", ASOF);
    expect(debtServiceMock.list).toHaveBeenCalledTimes(2);
    expect(debtServiceMock.list).toHaveBeenNthCalledWith(1, "user-1", {
      status: "active",
      limit: 200
    });
    expect(debtServiceMock.list).toHaveBeenNthCalledWith(2, "user-1", {
      status: "active",
      limit: 200,
      cursor: "debt-1"
    });

    const debtItem = diagnostic.items.find((i) => i.key === "debt_inventory");
    expect(debtItem?.evidence.activeCount).toBe(2);
    expect(debtItem?.evidence.highCostDebtCount).toBe(1);
  });
});

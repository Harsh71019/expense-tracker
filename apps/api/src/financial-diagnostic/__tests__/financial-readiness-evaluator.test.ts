import {
  type FinancialProfileState,
  type ProtectionState,
  type SafetyBufferState,
  type DeclaredDebtPage
} from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import type { AccountDiagnosticFacts } from "../../accounts/account-diagnostic-read.service.js";
import type { AssetDiagnosticFacts } from "../../assets/asset-diagnostic-read.service.js";
import type { CategoryDiagnosticFacts } from "../../categories/category-diagnostic-read.service.js";
import type { GoalDiagnosticFacts } from "../../goals/goal-diagnostic-read.service.js";
import type { LedgerHistoryDiagnosticFacts } from "../../transactions/ledger-history-diagnostic-read.service.js";
import {
  evaluateFinancialReadiness,
  type ReadinessEvaluatorInput
} from "../financial-readiness-evaluator.js";

const ASOF = new Date("2026-08-18T10:00:00.000Z");
const COMPUTED_AT = new Date("2026-08-18T10:00:00.000Z");

function createFixture(overrides: Partial<ReadinessEvaluatorInput> = {}): ReadinessEvaluatorInput {
  const financialProfileState: FinancialProfileState = {
    configured: false,
    profile: null,
    currentSalaryVersion: null,
    upcomingSalaryVersion: null,
    suggestedMonthlyWorkMinutes: 9600,
    asOf: ASOF
  };

  const protectionState: ProtectionState = {
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
    limitations: ["No protection answers recorded."]
  };

  const declaredDebts: DeclaredDebtPage = {
    items: [],
    pageInfo: { hasMore: false, nextCursor: null, limit: 200 },
    highCost: {
      thresholdBps: 1200,
      comparison: "greater_than",
      highCostCount: 0
    }
  };

  const safetyBufferState: SafetyBufferState = {
    preference: null,
    isFallback: true,
    fallbackPolicy: "zero_balance_default",
    targetMinor: 0,
    liquidBalanceMinor: 0,
    bufferGapMinor: 0,
    bufferSurplusMinor: 0,
    monthlyEssentialOutflowMinor: 0
  };

  const accountFacts: AccountDiagnosticFacts = {
    activeCount: 0,
    nonCreditCardCount: 0,
    creditCardCount: 0,
    creditCardOnly: false,
    liquidCount: 0,
    lastUpdatedAt: null
  };

  const categoryFacts: CategoryDiagnosticFacts = {
    activeExpenseCategoryCount: 0,
    essentialExpenseCategoryCount: 0,
    totalActiveCategoryCount: 0,
    lastUpdatedAt: null
  };

  const ledgerHistoryFacts: LedgerHistoryDiagnosticFacts = {
    completeMonthCount: 0,
    qualifyingTransactionCount: 0,
    latestExpenseAt: null,
    oldestExpenseAt: null,
    months: [],
    hasCurrentMonthExpenses: false
  };

  const assetFacts: AssetDiagnosticFacts = {
    activeAssetCount: 0,
    missingValuationCount: 0,
    staleValuationCount: 0,
    latestValuationAt: null,
    hasActiveAssets: false,
    lastUpdatedAt: null
  };

  const goalFacts: GoalDiagnosticFacts = {
    activeGoalCount: 0,
    totalGoalCount: 0,
    hasActiveGoals: false,
    lastUpdatedAt: null
  };

  return {
    userId: "test-user",
    asOf: ASOF,
    computedAt: COMPUTED_AT,
    financialProfileState,
    protectionState,
    declaredDebts,
    safetyBufferState,
    accountFacts,
    categoryFacts,
    ledgerHistoryFacts,
    assetFacts,
    goalFacts,
    ...overrides
  };
}

describe("evaluateFinancialReadiness pure evaluator", () => {
  it("evaluates a completely new user with setup_required and configure_salary as next action", () => {
    const input = createFixture();
    const result = evaluateFinancialReadiness(input);

    expect(result.overallStatus).toBe("setup_required");
    expect(result.readyCount).toBe(0);
    expect(result.totalRequiredCount).toBe(6);
    expect(result.nextAction).toBe("configure_salary");
    expect(result.availableCapabilities).toEqual([]);
    expect(result.unavailableCapabilities).toContain("salary_statistics");
    expect(result.unavailableCapabilities).toContain("life_hour");
    expect(result.unavailableCapabilities).toContain("essential_burn");

    const salaryItem = result.items.find((i) => i.key === "salary");
    expect(salaryItem?.status).toBe("missing");
    expect(salaryItem?.attention).toBe("blocking");

    const protectionItem = result.items.find((i) => i.key === "protection");
    expect(protectionItem?.status).toBe("missing");
    expect(protectionItem?.attention).toBe("blocking");

    const debtItem = result.items.find((i) => i.key === "debt_inventory");
    expect(debtItem?.status).toBe("limited");
    expect(debtItem?.attention).toBe("information");
  });

  it("evaluates salary and unlocks salary statistics when effective salary is present", () => {
    const input = createFixture({
      financialProfileState: {
        configured: true,
        profile: {
          userId: "test-user",
          monthlyWorkMinutes: 9600,
          salaryCreditDay: 1,
          expectedAnnualIncrementBps: null,
          incomeStability: "stable",
          createdAt: ASOF,
          updatedAt: ASOF
        },
        currentSalaryVersion: {
          id: "11111111-1111-4111-8111-111111111111",
          userId: "test-user",
          netMonthlySalaryMinor: 15_00_000,
          annualCtcMinor: null,
          effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
          source: "manually_confirmed",
          createdAt: ASOF
        },
        upcomingSalaryVersion: null,
        suggestedMonthlyWorkMinutes: 9600,
        asOf: ASOF
      }
    });

    const result = evaluateFinancialReadiness(input);

    expect(result.availableCapabilities).toContain("salary_statistics");
    expect(result.availableCapabilities).toContain("life_hour");
    const salaryItem = result.items.find((i) => i.key === "salary");
    expect(salaryItem?.status).toBe("ready");
    expect(salaryItem?.attention).toBe("none");

    const workItem = result.items.find((i) => i.key === "work_schedule");
    expect(workItem?.status).toBe("ready");
    expect(workItem?.attention).toBe("none");

    // Next action advances to account creation
    expect(result.nextAction).toBe("create_account");
  });

  it("treats credit-card-only setup as limited accounts with warning attention", () => {
    const input = createFixture({
      accountFacts: {
        activeCount: 2,
        nonCreditCardCount: 0,
        creditCardCount: 2,
        creditCardOnly: true,
        liquidCount: 0,
        lastUpdatedAt: ASOF
      }
    });

    const result = evaluateFinancialReadiness(input);
    const accountItem = result.items.find((i) => i.key === "accounts");
    expect(accountItem?.status).toBe("limited");
    expect(accountItem?.attention).toBe("warning");
    expect(accountItem?.summaryKey).toBe("accounts.credit_card_only");
  });

  it("evaluates burn history: 0 months (missing), 1-2 months (limited), 3+ months (ready)", () => {
    // 1 month
    const input1 = createFixture({
      categoryFacts: {
        activeExpenseCategoryCount: 3,
        essentialExpenseCategoryCount: 2,
        totalActiveCategoryCount: 4,
        lastUpdatedAt: ASOF
      },
      ledgerHistoryFacts: {
        completeMonthCount: 1,
        qualifyingTransactionCount: 5,
        latestExpenseAt: new Date("2026-07-15T00:00:00.000Z"),
        oldestExpenseAt: new Date("2026-07-01T00:00:00.000Z"),
        months: ["2026-07"],
        hasCurrentMonthExpenses: true
      }
    });
    const result1 = evaluateFinancialReadiness(input1);
    const burnItem1 = result1.items.find((i) => i.key === "burn_history");
    expect(burnItem1?.status).toBe("limited");
    expect(result1.availableCapabilities).not.toContain("essential_burn");

    // 3 months within freshness window
    const input3 = createFixture({
      categoryFacts: {
        activeExpenseCategoryCount: 3,
        essentialExpenseCategoryCount: 2,
        totalActiveCategoryCount: 4,
        lastUpdatedAt: ASOF
      },
      ledgerHistoryFacts: {
        completeMonthCount: 3,
        qualifyingTransactionCount: 25,
        latestExpenseAt: new Date("2026-08-05T00:00:00.000Z"),
        oldestExpenseAt: new Date("2026-05-01T00:00:00.000Z"),
        months: ["2026-05", "2026-06", "2026-07"],
        hasCurrentMonthExpenses: true
      }
    });
    const result3 = evaluateFinancialReadiness(input3);
    const burnItem3 = result3.items.find((i) => i.key === "burn_history");
    expect(burnItem3?.status).toBe("ready");
    expect(result3.availableCapabilities).toContain("essential_burn");
  });

  it("marks burn history as stale when latest essential expense exceeds 90 days", () => {
    const inputStale = createFixture({
      categoryFacts: {
        activeExpenseCategoryCount: 3,
        essentialExpenseCategoryCount: 2,
        totalActiveCategoryCount: 4,
        lastUpdatedAt: ASOF
      },
      ledgerHistoryFacts: {
        completeMonthCount: 4,
        qualifyingTransactionCount: 30,
        latestExpenseAt: new Date("2026-04-01T00:00:00.000Z"), // > 130 days before Aug 18
        oldestExpenseAt: new Date("2026-01-01T00:00:00.000Z"),
        months: ["2026-01", "2026-02", "2026-03", "2026-04"],
        hasCurrentMonthExpenses: false
      }
    });
    const result = evaluateFinancialReadiness(inputStale);
    const burnItem = result.items.find((i) => i.key === "burn_history");
    expect(burnItem?.status).toBe("stale");
    expect(burnItem?.attention).toBe("warning");
  });

  it("separates readiness from financial condition for employer-only and missing protection", () => {
    // Employer-only: ready data + warning attention
    const inputEmployer = createFixture({
      protectionState: {
        configured: true,
        currentSnapshot: {
          id: "22222222-2222-4222-8222-222222222222",
          userId: "test-user",
          effectiveFrom: ASOF,
          termCoverStatus: "employer_only",
          independentTermCoverMinor: null,
          employerTermCoverMinor: 50_00_000,
          independentTermExpiresOn: null,
          termNotApplicableReason: null,
          healthCoverStatus: "employer_only",
          independentHealthBaseCoverMinor: null,
          independentHealthSuperTopUpMinor: null,
          employerHealthCoverMinor: 5_00_000,
          independentHealthExpiresOn: null,
          dependantCount: 0,
          createdAt: ASOF
        },
        upcomingSnapshot: null,
        asOf: ASOF,
        dataQuality: "complete",
        termCover: {
          state: "employer_only",
          expiryState: "not_applicable",
          expiresOn: null,
          hasIndependentCover: false,
          hasEmployerCover: true
        },
        healthCover: {
          state: "employer_only",
          expiryState: "not_applicable",
          expiresOn: null,
          hasIndependentCover: false,
          hasEmployerCover: true
        },
        expiringSoonDays: 90,
        limitations: ["Employer-only cover may lapse upon job change."]
      }
    });
    const resultEmployer = evaluateFinancialReadiness(inputEmployer);
    const protItem = resultEmployer.items.find((i) => i.key === "protection");
    expect(protItem?.status).toBe("ready");
    expect(protItem?.attention).toBe("warning");
    expect(protItem?.limitationKeys).toContain("protection.employer_only_job_change_risk");
    expect(resultEmployer.limitations).toContain("protection.employer_only_job_change_risk");
    expect(resultEmployer.limitations).not.toContain(
      "Employer-only cover may lapse upon job change."
    );

    // None declared: ready data + blocking attention
    const inputNone = createFixture({
      protectionState: {
        ...inputEmployer.protectionState,
        termCover: {
          ...inputEmployer.protectionState.termCover,
          state: "none_declared"
        }
      }
    });
    const resultNone = evaluateFinancialReadiness(inputNone);
    const protNoneItem = resultNone.items.find((i) => i.key === "protection");
    expect(protNoneItem?.status).toBe("ready");
    expect(protNoneItem?.attention).toBe("blocking");
    expect(protNoneItem?.limitationKeys).toContain("protection.unprotected_gap");
  });

  it("handles high cost debt: estimated or ready readiness + blocking attention", () => {
    const inputHighCost = createFixture({
      declaredDebts: {
        items: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            userId: "test-user",
            name: "Credit Card Outstanding",
            kind: "credit_card",
            declaredOutstandingMinor: 50_000,
            outstandingMinor: 50_000,
            annualRateBps: 3600, // 36% p.a.
            minimumPaymentMinor: 5_000,
            linkedAssetId: null,
            linkedAssetName: null,
            amountSource: "declared",
            valuationAsOf: null,
            isEstimate: true,
            isHighCost: true,
            status: "active",
            createdAt: ASOF,
            updatedAt: ASOF,
            resolvedAt: null
          }
        ],
        pageInfo: { hasMore: false, nextCursor: null, limit: 200 },
        highCost: {
          thresholdBps: 1200,
          comparison: "greater_than",
          highCostCount: 1
        }
      }
    });

    const result = evaluateFinancialReadiness(inputHighCost);
    const debtItem = result.items.find((i) => i.key === "debt_inventory");
    expect(debtItem?.status).toBe("estimated");
    expect(debtItem?.attention).toBe("blocking");
  });

  it("handles assets and valuations: missing valuations vs stale valuations", () => {
    // Active assets with missing valuation
    const inputMissingVal = createFixture({
      assetFacts: {
        activeAssetCount: 2,
        missingValuationCount: 1,
        staleValuationCount: 0,
        latestValuationAt: new Date("2026-08-01T00:00:00.000Z"),
        hasActiveAssets: true,
        lastUpdatedAt: ASOF
      }
    });
    const resultMissing = evaluateFinancialReadiness(inputMissingVal);
    const valItem1 = resultMissing.items.find((i) => i.key === "asset_valuations");
    expect(valItem1?.status).toBe("limited");
    expect(valItem1?.attention).toBe("warning");

    // Active assets with stale valuation
    const inputStaleVal = createFixture({
      assetFacts: {
        activeAssetCount: 1,
        missingValuationCount: 0,
        staleValuationCount: 1,
        latestValuationAt: new Date("2026-01-01T00:00:00.000Z"),
        hasActiveAssets: true,
        lastUpdatedAt: ASOF
      }
    });
    const resultStale = evaluateFinancialReadiness(inputStaleVal);
    const valItem2 = resultStale.items.find((i) => i.key === "asset_valuations");
    expect(valItem2?.status).toBe("stale");
    expect(valItem2?.attention).toBe("warning");
  });

  it("evaluates a fully configured user as ready with nextAction null", () => {
    const input = createFixture({
      financialProfileState: {
        configured: true,
        profile: {
          userId: "test-user",
          monthlyWorkMinutes: 9600,
          salaryCreditDay: 1,
          expectedAnnualIncrementBps: null,
          incomeStability: "stable",
          createdAt: ASOF,
          updatedAt: ASOF
        },
        currentSalaryVersion: {
          id: "11111111-1111-4111-8111-111111111111",
          userId: "test-user",
          netMonthlySalaryMinor: 15_00_000,
          annualCtcMinor: null,
          effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
          source: "manually_confirmed",
          createdAt: ASOF
        },
        upcomingSalaryVersion: null,
        suggestedMonthlyWorkMinutes: 9600,
        asOf: ASOF
      },
      accountFacts: {
        activeCount: 3,
        nonCreditCardCount: 2,
        creditCardCount: 1,
        creditCardOnly: false,
        liquidCount: 2,
        lastUpdatedAt: ASOF
      },
      categoryFacts: {
        activeExpenseCategoryCount: 10,
        essentialExpenseCategoryCount: 4,
        totalActiveCategoryCount: 12,
        lastUpdatedAt: ASOF
      },
      ledgerHistoryFacts: {
        completeMonthCount: 6,
        qualifyingTransactionCount: 80,
        latestExpenseAt: new Date("2026-08-10T00:00:00.000Z"),
        oldestExpenseAt: new Date("2026-02-01T00:00:00.000Z"),
        months: ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"],
        hasCurrentMonthExpenses: true
      },
      protectionState: {
        configured: true,
        currentSnapshot: {
          id: "22222222-2222-4222-8222-222222222222",
          userId: "test-user",
          effectiveFrom: ASOF,
          termCoverStatus: "independent",
          independentTermCoverMinor: 1_00_00_000,
          employerTermCoverMinor: null,
          independentTermExpiresOn: new Date("2050-01-01T00:00:00.000Z"),
          termNotApplicableReason: null,
          healthCoverStatus: "independent",
          independentHealthBaseCoverMinor: 10_00_000,
          independentHealthSuperTopUpMinor: null,
          employerHealthCoverMinor: null,
          independentHealthExpiresOn: new Date("2027-01-01T00:00:00.000Z"),
          dependantCount: 1,
          createdAt: ASOF
        },
        upcomingSnapshot: null,
        asOf: ASOF,
        dataQuality: "complete",
        termCover: {
          state: "complete",
          expiryState: "active",
          expiresOn: new Date("2050-01-01T00:00:00.000Z"),
          hasIndependentCover: true,
          hasEmployerCover: false
        },
        healthCover: {
          state: "complete",
          expiryState: "active",
          expiresOn: new Date("2027-01-01T00:00:00.000Z"),
          hasIndependentCover: true,
          hasEmployerCover: false
        },
        expiringSoonDays: 90,
        limitations: []
      },
      safetyBufferState: {
        preference: {
          id: "44444444-4444-4444-8444-444444444444",
          userId: "test-user",
          version: 1,
          mode: "fixed_amount",
          amountMinor: 5_000_000,
          months: null,
          emergencyFundGoalId: null,
          effectiveFrom: ASOF,
          createdAt: ASOF
        },
        isFallback: false,
        fallbackPolicy: null,
        targetMinor: 5_000_000,
        liquidBalanceMinor: 6_000_000,
        bufferGapMinor: 0,
        bufferSurplusMinor: 1_000_000,
        monthlyEssentialOutflowMinor: 500_000
      },
      assetFacts: {
        activeAssetCount: 2,
        missingValuationCount: 0,
        staleValuationCount: 0,
        latestValuationAt: new Date("2026-08-01T00:00:00.000Z"),
        hasActiveAssets: true,
        lastUpdatedAt: ASOF
      },
      goalFacts: {
        activeGoalCount: 2,
        totalGoalCount: 2,
        hasActiveGoals: true,
        lastUpdatedAt: ASOF
      }
    });

    const result = evaluateFinancialReadiness(input);
    expect(result.overallStatus).toBe("ready");
    expect(result.readyCount).toBe(6);
    expect(result.totalRequiredCount).toBe(6);
    expect(result.readyCount).toBe(result.totalRequiredCount);
    expect(result.availableCapabilities).toContain("salary_statistics");
    expect(result.availableCapabilities).toContain("life_hour");
    expect(result.availableCapabilities).toContain("essential_burn");
    expect(result.availableCapabilities).toContain("goal_feasibility");
    expect(result.nextAction).toBeNull();
  });
});

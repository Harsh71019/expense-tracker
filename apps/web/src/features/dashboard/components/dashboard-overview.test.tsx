import { render, screen } from "@testing-library/react";
import type {
  CashflowResponse,
  DashboardInvestments,
  DashboardStats,
  EssentialBurnResponse,
  MonthlySpending,
  RecurringForecast,
  SafetyEvaluation,
  SpendMix,
  TopSpendingItem
} from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { DashboardOverview } from "./dashboard-overview";

const mocks = vi.hoisted(() => ({
  useStats: vi.fn(),
  useMonthlySpending: vi.fn(),
  useInvestments: vi.fn(),
  useCashflow: vi.fn(),
  useSpendMix: vi.fn(),
  useTopSpending: vi.fn(),
  useRecurringForecast: vi.fn()
}));
vi.mock("../hooks/use-stats", () => ({ useStats: mocks.useStats }));
vi.mock("../hooks/use-monthly-spending", () => ({
  useMonthlySpending: mocks.useMonthlySpending
}));
vi.mock("../hooks/use-investments", () => ({ useInvestments: mocks.useInvestments }));
vi.mock("../hooks/use-cashflow", () => ({ useCashflow: mocks.useCashflow }));
vi.mock("../hooks/use-spend-mix", () => ({ useSpendMix: mocks.useSpendMix }));
vi.mock("../hooks/use-top-spending", () => ({ useTopSpending: mocks.useTopSpending }));
vi.mock("../hooks/use-recurring-forecast", () => ({
  useRecurringForecast: mocks.useRecurringForecast
}));
vi.mock("@/features/reports/components/pie-chart", () => ({
  PieChart: () => <svg role="img" aria-label="pie" />
}));
vi.mock("@/features/financial-profile", () => ({
  DataReadinessPanel: ({
    initialDiagnostic,
    showAction
  }: {
    initialDiagnostic: unknown;
    showAction?: boolean;
  }) =>
    initialDiagnostic ? (
      <div>
        Copilot Data Readiness
        {showAction ? <span>Action Visible</span> : <span>Action Hidden</span>}
      </div>
    ) : null
}));
vi.mock("@/features/financial-safety", () => ({
  EssentialBurnCard: ({ initialData }: { initialData: unknown }) =>
    initialData ? <div>Essential Monthly Burn Card</div> : null,
  SafetyStatusPanel: ({ initialData }: { initialData: unknown }) =>
    initialData ? <div>Safety Status Panel</div> : null
}));

const stats: DashboardStats = {
  period: "2026-07",
  spent: { valueMinor: 100, deltaPct: -5, trend: [120, 110, 100] },
  income: { valueMinor: 500, deltaPct: 5, trend: [480, 490, 500] },
  savingsRate: { valuePct: 30, deltaPct: 2, trend: [28, 29, 30] },
  netWorth: { valueMinor: 10_000, deltaPct: 1, trend: [9900, 9950, 10000] }
};
const cashflow: CashflowResponse = { range: "6M", buckets: [] };
const monthlySpending: MonthlySpending = {
  period: "2026-07",
  asOf: new Date("2026-07-15T06:00:00.000Z"),
  totalMinor: 6_000,
  daily: [{ date: new Date("2026-06-30T18:30:00.000Z"), amountMinor: 6_000 }],
  weekly: [
    {
      startAt: new Date("2026-06-30T18:30:00.000Z"),
      endAt: new Date("2026-07-06T18:30:00.000Z"),
      amountMinor: 6_000
    }
  ]
};
const spendMix: SpendMix = {
  range: "1M",
  totalMinor: 0,
  essential: { amountMinor: 0, pct: 0 },
  lifestyle: { amountMinor: 0, pct: 0 },
  uncategorized: { amountMinor: 0, pct: 0 }
};
const topSpending: TopSpendingItem[] = [];
const recurringForecast: RecurringForecast = {
  range: "1M",
  inMinor: 0,
  outMinor: 0,
  netMinor: 0,
  upcoming: []
};
const investments: DashboardInvestments = { items: [] };

function setup(overrideStats: DashboardStats | null = stats): void {
  mocks.useStats.mockReturnValue({ data: overrideStats });
  mocks.useMonthlySpending.mockReturnValue({ data: monthlySpending });
  mocks.useInvestments.mockReturnValue({ data: investments });
  mocks.useCashflow.mockReturnValue({ data: undefined });
  mocks.useSpendMix.mockReturnValue({ data: undefined });
  mocks.useTopSpending.mockReturnValue({ data: undefined });
  mocks.useRecurringForecast.mockReturnValue({ data: undefined });
}

describe("DashboardOverview", () => {
  it("renders the page title and every panel", () => {
    setup();
    render(
      <DashboardOverview
        initialStats={stats}
        initialMonthlySpending={monthlySpending}
        initialCashflow={cashflow}
        initialSpendMix={spendMix}
        initialTopSpending={topSpending}
        initialRecurringForecast={recurringForecast}
        initialInvestments={investments}
        initialBudgets={null}
      />
    );

    expect(screen.getByRole("heading", { name: "Financial overview" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Cash flow" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "This month's spending rhythm" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Spend mix" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Top spending" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Recurring commitments" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Investments & deposits" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Monthly budgets" })).toBeVisible();
    expect(screen.getByText(`SPENT · ${stats.period}`)).toBeVisible();
  });

  it("omits the stat cards when stats could not be loaded", () => {
    setup(null);
    render(
      <DashboardOverview
        initialStats={null}
        initialMonthlySpending={monthlySpending}
        initialCashflow={cashflow}
        initialSpendMix={spendMix}
        initialTopSpending={topSpending}
        initialRecurringForecast={recurringForecast}
        initialInvestments={investments}
        initialBudgets={null}
      />
    );

    expect(screen.queryByText(/SPENT ·/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Financial overview" })).toBeVisible();
  });

  it("renders DataReadinessPanel when initialDiagnostic is provided", () => {
    setup();
    const diagnostic = {
      computedAt: new Date("2026-08-18T10:00:00.000Z"),
      sourceThrough: new Date("2026-08-18T10:00:00.000Z"),
      formulaVersion: 1,
      policyVersion: 1,
      overallStatus: "setup_required" as const,
      readyCount: 1,
      totalRequiredCount: 4,
      availableCapabilities: [],
      unavailableCapabilities: [],
      nextAction: "configure_salary" as const,
      items: [],
      limitations: []
    };

    render(
      <DashboardOverview
        initialStats={stats}
        initialMonthlySpending={monthlySpending}
        initialCashflow={cashflow}
        initialSpendMix={spendMix}
        initialTopSpending={topSpending}
        initialRecurringForecast={recurringForecast}
        initialInvestments={investments}
        initialBudgets={null}
        initialDiagnostic={diagnostic}
      />
    );

    expect(screen.getByText("Copilot Data Readiness")).toBeVisible();
  });

  it("renders EssentialBurnCard when initialEssentialBurn is provided", () => {
    setup();
    const essentialBurn: EssentialBurnResponse = {
      computedAt: new Date("2026-08-18T10:00:00.000Z"),
      asOf: new Date("2026-08-18T10:00:00.000Z"),
      sourceThrough: new Date("2026-08-18T10:00:00.000Z"),
      formulaVersion: 1,
      timezone: "Asia/Kolkata",
      requiredCompleteMonths: 3,
      observedCompleteMonthCount: 3,
      averageMonthlyEssentialMinor: 50_000,
      quality: "complete",
      completeMonths: [],
      currentPartialMonth: {
        month: "2026-08",
        essentialTotalMinor: 0,
        eligibleExpenseTransactionCount: 0,
        essentialTransactionCount: 0,
        excludedFromBaseline: true
      },
      classification: {
        eligibleExpenseTransactionCount: 0,
        essentialExpenseTransactionCount: 0,
        lifestyleExpenseTransactionCount: 0,
        uncategorizedExpenseCount: 0,
        uncategorizedExpenseMinor: 0,
        ungroupedExpenseCount: 0,
        ungroupedExpenseMinor: 0,
        categorizedExpenseMinor: 0,
        unclassifiedExpenseMinor: 0,
        coverageRatioBps: 10000,
        currentCategoryMetadataInUse: true
      },
      limitations: []
    };

    render(
      <DashboardOverview
        initialStats={stats}
        initialMonthlySpending={monthlySpending}
        initialCashflow={cashflow}
        initialSpendMix={spendMix}
        initialTopSpending={topSpending}
        initialRecurringForecast={recurringForecast}
        initialInvestments={investments}
        initialBudgets={null}
        initialEssentialBurn={essentialBurn}
      />
    );

    expect(screen.getByText("Essential Monthly Burn Card")).toBeVisible();
  });

  it("renders SafetyStatusPanel when initialSafetyEvaluation is provided", () => {
    setup();
    const safetyEvaluation: SafetyEvaluation = {
      evaluationId: null,
      snapshotStatus: "live",
      computedAt: new Date("2026-08-18T10:00:00.000Z"),
      asOf: new Date("2026-08-18T10:00:00.000Z"),
      sourceThrough: new Date("2026-08-01T00:00:00.000Z"),
      formulaVersion: 1,
      policyVersion: 1,
      inputFingerprint: "fp",
      quality: "complete",
      currentStage: "building_fortress",
      nextAction: "configure_reserves",
      runway: {
        availability: "available",
        unavailableReason: null,
        tier: "healthy",
        runwayBasisPoints: 45_000,
        runwayDays: 135,
        eligibleReserveMinor: 4_50_000_00,
        essentialBurnMinor: 1_00_000_00,
        observedCompleteMonthCount: 3,
        policyDaysPerMonth: 30,
        criticalThresholdBasisPoints: 30_000,
        fortifiedThresholdBasisPoints: 60_000
      },
      target: {
        policyTargetMinor: 6_00_000_00,
        userTargetMinor: null,
        effectiveTargetMinor: 6_00_000_00,
        targetSource: "policy",
        targetMonths: 6,
        currentGapMinor: 1_50_000_00,
        currentSurplusMinor: 0
      },
      checks: [],
      limitations: [],
      essentialBurnEvidence: {
        averageMonthlyEssentialMinor: 1_00_000_00,
        observedCompleteMonthCount: 3,
        quality: "complete"
      },
      reserveEvidence: {
        totalEligibleMinor: 4_50_000_00,
        instantMinor: 3_00_000_00,
        tPlusOneMinor: 1_50_000_00,
        lockedMinor: 0,
        staleExcludedMinor: 0,
        currentlyEligibleSourceCount: 2,
        configuredSourceCount: 2
      },
      protectionEvidence: {
        termCoverState: "complete",
        healthCoverState: "complete",
        incomeBasis: "annual_ctc",
        incomeBasisQuality: "confirmed",
        termBenchmarkMinor: 10_000_000_00,
        healthBenchmarkMinor: 1_000_000_00
      },
      debtEvidence: {
        activeDebtCount: 0,
        highCostDebtCount: 0
      }
    };

    render(
      <DashboardOverview
        initialStats={stats}
        initialMonthlySpending={monthlySpending}
        initialCashflow={cashflow}
        initialSpendMix={spendMix}
        initialTopSpending={topSpending}
        initialRecurringForecast={recurringForecast}
        initialInvestments={investments}
        initialBudgets={null}
        initialSafetyEvaluation={safetyEvaluation}
      />
    );

    expect(screen.getByText("Safety Status Panel")).toBeVisible();
  });

  it("suppresses DataReadinessPanel action when initialSafetyEvaluation has an actionable nextAction", () => {
    setup();
    const diagnostic = {
      computedAt: new Date("2026-08-18T10:00:00.000Z"),
      sourceThrough: new Date("2026-08-18T10:00:00.000Z"),
      formulaVersion: 1,
      policyVersion: 1,
      overallStatus: "setup_required" as const,
      readyCount: 1,
      totalRequiredCount: 4,
      availableCapabilities: [],
      unavailableCapabilities: [],
      nextAction: "configure_salary" as const,
      items: [],
      limitations: []
    };
    const safetyEvaluation: SafetyEvaluation = {
      evaluationId: null,
      snapshotStatus: "live",
      computedAt: new Date("2026-08-18T10:00:00.000Z"),
      asOf: new Date("2026-08-18T10:00:00.000Z"),
      sourceThrough: new Date("2026-08-01T00:00:00.000Z"),
      formulaVersion: 1,
      policyVersion: 1,
      inputFingerprint: "fp",
      quality: "complete",
      currentStage: "building_fortress",
      nextAction: "configure_reserves",
      runway: {
        availability: "available",
        unavailableReason: null,
        tier: "healthy",
        runwayBasisPoints: 45_000,
        runwayDays: 135,
        eligibleReserveMinor: 4_50_000_00,
        essentialBurnMinor: 1_00_000_00,
        observedCompleteMonthCount: 3,
        policyDaysPerMonth: 30,
        criticalThresholdBasisPoints: 30_000,
        fortifiedThresholdBasisPoints: 60_000
      },
      target: {
        policyTargetMinor: 6_00_000_00,
        userTargetMinor: null,
        effectiveTargetMinor: 6_00_000_00,
        targetSource: "policy",
        targetMonths: 6,
        currentGapMinor: 1_50_000_00,
        currentSurplusMinor: 0
      },
      checks: [],
      limitations: [],
      essentialBurnEvidence: {
        averageMonthlyEssentialMinor: 1_00_000_00,
        observedCompleteMonthCount: 3,
        quality: "complete"
      },
      reserveEvidence: {
        totalEligibleMinor: 4_50_000_00,
        instantMinor: 3_00_000_00,
        tPlusOneMinor: 1_50_000_00,
        lockedMinor: 0,
        staleExcludedMinor: 0,
        currentlyEligibleSourceCount: 2,
        configuredSourceCount: 2
      },
      protectionEvidence: {
        termCoverState: "complete",
        healthCoverState: "complete",
        incomeBasis: "annual_ctc",
        incomeBasisQuality: "confirmed",
        termBenchmarkMinor: 10_000_000_00,
        healthBenchmarkMinor: 1_000_000_00
      },
      debtEvidence: {
        activeDebtCount: 0,
        highCostDebtCount: 0
      }
    };

    render(
      <DashboardOverview
        initialStats={stats}
        initialMonthlySpending={monthlySpending}
        initialCashflow={cashflow}
        initialSpendMix={spendMix}
        initialTopSpending={topSpending}
        initialRecurringForecast={recurringForecast}
        initialInvestments={investments}
        initialBudgets={null}
        initialDiagnostic={diagnostic}
        initialSafetyEvaluation={safetyEvaluation}
      />
    );

    expect(screen.getByText("Action Hidden")).toBeVisible();
    expect(screen.queryByText("Action Visible")).not.toBeInTheDocument();
  });

  it("shows DataReadinessPanel action when initialSafetyEvaluation is missing or nextAction is none", () => {
    setup();
    const diagnostic = {
      computedAt: new Date("2026-08-18T10:00:00.000Z"),
      sourceThrough: new Date("2026-08-18T10:00:00.000Z"),
      formulaVersion: 1,
      policyVersion: 1,
      overallStatus: "setup_required" as const,
      readyCount: 1,
      totalRequiredCount: 4,
      availableCapabilities: [],
      unavailableCapabilities: [],
      nextAction: "configure_salary" as const,
      items: [],
      limitations: []
    };

    const { rerender } = render(
      <DashboardOverview
        initialStats={stats}
        initialMonthlySpending={monthlySpending}
        initialCashflow={cashflow}
        initialSpendMix={spendMix}
        initialTopSpending={topSpending}
        initialRecurringForecast={recurringForecast}
        initialInvestments={investments}
        initialBudgets={null}
        initialDiagnostic={diagnostic}
        initialSafetyEvaluation={null}
      />
    );

    expect(screen.getByText("Action Visible")).toBeVisible();

    const noneSafetyEvaluation: SafetyEvaluation = {
      evaluationId: null,
      snapshotStatus: "live",
      computedAt: new Date("2026-08-18T10:00:00.000Z"),
      asOf: new Date("2026-08-18T10:00:00.000Z"),
      sourceThrough: new Date("2026-08-01T00:00:00.000Z"),
      formulaVersion: 1,
      policyVersion: 1,
      inputFingerprint: "fp",
      quality: "complete",
      currentStage: "building_fortress",
      nextAction: "none",
      runway: {
        availability: "available",
        unavailableReason: null,
        tier: "healthy",
        runwayBasisPoints: 45_000,
        runwayDays: 135,
        eligibleReserveMinor: 4_50_000_00,
        essentialBurnMinor: 1_00_000_00,
        observedCompleteMonthCount: 3,
        policyDaysPerMonth: 30,
        criticalThresholdBasisPoints: 30_000,
        fortifiedThresholdBasisPoints: 60_000
      },
      target: {
        policyTargetMinor: 6_00_000_00,
        userTargetMinor: null,
        effectiveTargetMinor: 6_00_000_00,
        targetSource: "policy",
        targetMonths: 6,
        currentGapMinor: 1_50_000_00,
        currentSurplusMinor: 0
      },
      checks: [],
      limitations: [],
      essentialBurnEvidence: {
        averageMonthlyEssentialMinor: 1_00_000_00,
        observedCompleteMonthCount: 3,
        quality: "complete"
      },
      reserveEvidence: {
        totalEligibleMinor: 4_50_000_00,
        instantMinor: 3_00_000_00,
        tPlusOneMinor: 1_50_000_00,
        lockedMinor: 0,
        staleExcludedMinor: 0,
        currentlyEligibleSourceCount: 2,
        configuredSourceCount: 2
      },
      protectionEvidence: {
        termCoverState: "complete",
        healthCoverState: "complete",
        incomeBasis: "annual_ctc",
        incomeBasisQuality: "confirmed",
        termBenchmarkMinor: 10_000_000_00,
        healthBenchmarkMinor: 1_000_000_00
      },
      debtEvidence: {
        activeDebtCount: 0,
        highCostDebtCount: 0
      }
    };

    rerender(
      <DashboardOverview
        initialStats={stats}
        initialMonthlySpending={monthlySpending}
        initialCashflow={cashflow}
        initialSpendMix={spendMix}
        initialTopSpending={topSpending}
        initialRecurringForecast={recurringForecast}
        initialInvestments={investments}
        initialBudgets={null}
        initialDiagnostic={diagnostic}
        initialSafetyEvaluation={noneSafetyEvaluation}
      />
    );

    expect(screen.getByText("Action Visible")).toBeVisible();
  });
});

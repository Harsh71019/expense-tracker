import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Goal, GoalFeasibilityReport, SafetyBufferState } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { GoalFeasibilityStudio } from "./goal-feasibility-studio";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    POST: vi.fn()
  }
}));

function renderWithQuery(ui: ReactNode): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const mockGoals: Goal[] = [
  {
    id: "goal-1",
    userId: "user-1",
    name: "Emergency Fund",
    targetMinor: 6_000_000,
    targetDate: new Date("2026-10-01T00:00:00.000Z"),
    fundingMode: "manual_envelope",
    priority: 0,
    status: "active",
    startedMinor: 0,
    progressMinor: 1_000_000,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  }
];

const mockReport: GoalFeasibilityReport = {
  asOf: new Date("2026-08-01T00:00:00.000Z"),
  forecastSnapshotId: null,
  forecastComputedAt: null,
  isForecastSufficient: true,
  isForecastStale: false,
  forecastModel: "trailing_median",
  safetyBufferVersion: 1,
  safetyBufferMode: "fixed_amount",
  safetyBufferTargetMinor: 5_000_000,
  liquidBalanceMinor: 10_000_000,
  liquidBufferGapMinor: 0,
  conservativeAvailableMonthlyMinor: 2_000_000,
  totalRequiredMonthlyMinor: 2_500_000,
  monthlySurplusMinor: 2_000_000,
  assumptions: {
    monthlyEssentialOutflowMinor: 3_000_000,
    isBufferDeficitDeducted: false
  },
  scenarios: [
    {
      scenarioType: "priority_order",
      name: "Priority Order",
      description: "Allocates monthly cash flow strictly according to user priority rank.",
      totalAllocatedMonthlyMinor: 2_000_000,
      unallocatedSurplusMinor: 0,
      allocations: [
        {
          goalId: "goal-1",
          goalName: "Emergency Fund",
          priority: 0,
          targetDate: new Date("2026-10-01T00:00:00.000Z"),
          targetMinor: 6_000_000,
          progressMinor: 1_000_000,
          remainingMinor: 5_000_000,
          requiredMonthlyMinor: 2_500_000,
          allocatedMonthlyMinor: 2_000_000,
          monthlyFundingGapMinor: 500_000,
          monthlyFundingSurplusMinor: 0,
          projectedRange: {
            optimisticDate: new Date("2026-10-01T00:00:00.000Z"),
            baselineDate: new Date("2026-11-01T00:00:00.000Z"),
            pessimisticDate: new Date("2026-12-01T00:00:00.000Z")
          },
          status: "delayed",
          explainability: "Allocated 80% of required monthly target."
        }
      ]
    },
    {
      scenarioType: "target_date_order",
      name: "Target Date Order",
      description: "Prioritizes goals with nearest deadlines first.",
      totalAllocatedMonthlyMinor: 2_000_000,
      unallocatedSurplusMinor: 0,
      allocations: [
        {
          goalId: "goal-1",
          goalName: "Emergency Fund",
          priority: 0,
          targetDate: new Date("2026-10-01T00:00:00.000Z"),
          targetMinor: 6_000_000,
          progressMinor: 1_000_000,
          remainingMinor: 5_000_000,
          requiredMonthlyMinor: 2_500_000,
          allocatedMonthlyMinor: 2_000_000,
          monthlyFundingGapMinor: 500_000,
          monthlyFundingSurplusMinor: 0,
          projectedRange: {
            optimisticDate: new Date("2026-10-01T00:00:00.000Z"),
            baselineDate: new Date("2026-11-01T00:00:00.000Z"),
            pessimisticDate: new Date("2026-12-01T00:00:00.000Z")
          },
          status: "delayed",
          explainability: "Allocated 80% of required monthly target."
        }
      ]
    }
  ]
};

const mockSafetyBuffer: SafetyBufferState = {
  preference: {
    id: "33333333-3333-4333-8333-333333333333",
    userId: "user-1",
    version: 1,
    mode: "fixed_amount",
    amountMinor: 5_000_000,
    months: null,
    emergencyFundGoalId: null,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z")
  },
  targetMinor: 5_000_000,
  liquidBalanceMinor: 10_000_000,
  bufferSurplusMinor: 5_000_000,
  bufferGapMinor: 0,
  isFallback: false,
  fallbackPolicy: null,
  monthlyEssentialOutflowMinor: 5_000_000
};

describe("GoalFeasibilityStudio", () => {
  it("renders scenario allocations and handles tab selection", () => {
    const onSelect = vi.fn();
    renderWithQuery(
      <GoalFeasibilityStudio
        feasibility={mockReport}
        safetyBuffer={mockSafetyBuffer}
        activeGoals={mockGoals}
        selectedScenarioType="priority_order"
        onSelectScenarioType={onSelect}
      />
    );

    expect(
      screen.getByRole("heading", { name: /Goal Feasibility & Cashflow Allocations/ })
    ).toBeVisible();
    expect(screen.getByText("Emergency Fund")).toBeVisible();
    expect(screen.getByText("Delayed")).toBeVisible();

    const targetDateTab = screen.getByRole("button", { name: "Target Date Order" });
    fireEvent.click(targetDateTab);
    expect(onSelect).toHaveBeenCalledWith("target_date_order");
  });
});

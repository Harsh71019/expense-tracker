import type { FinancialDiagnostic } from "@treasury-ops/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OnboardingWizard } from "./onboarding-wizard";

const DIAGNOSTIC_FIXTURE: FinancialDiagnostic = {
  computedAt: new Date("2026-08-18T10:00:00.000Z"),
  sourceThrough: new Date("2026-08-18T10:00:00.000Z"),
  formulaVersion: 1,
  policyVersion: 1,
  overallStatus: "setup_required",
  readyCount: 2,
  totalRequiredCount: 4,
  availableCapabilities: ["salary_statistics"],
  unavailableCapabilities: ["life_hour", "essential_burn"],
  nextAction: "create_account",
  items: [
    {
      key: "salary",
      status: "ready",
      attention: "none",
      source: "financial_profile",
      lastUpdatedAt: new Date("2026-08-18T10:00:00.000Z"),
      requiredFor: ["salary_statistics"],
      action: null,
      evidence: {
        observedCount: null,
        requiredCount: null,
        completeMonthCount: null,
        activeCount: 1,
        estimatedCount: null,
        staleCount: null,
        highCostDebtCount: null,
        missingValuationCount: null,
        latestObservedAt: new Date("2026-08-18T10:00:00.000Z"),
        oldestRelevantAt: null,
        freshnessThresholdDays: null
      },
      summaryKey: "salary.ready",
      limitationKeys: []
    },
    {
      key: "accounts",
      status: "missing",
      attention: "blocking",
      source: "accounts",
      lastUpdatedAt: null,
      requiredFor: ["essential_burn"],
      action: "create_account",
      evidence: {
        observedCount: 0,
        requiredCount: null,
        completeMonthCount: null,
        activeCount: 0,
        estimatedCount: null,
        staleCount: null,
        highCostDebtCount: null,
        missingValuationCount: null,
        latestObservedAt: null,
        oldestRelevantAt: null,
        freshnessThresholdDays: null
      },
      summaryKey: "accounts.missing",
      limitationKeys: ["accounts.none_created"]
    }
  ],
  limitations: ["accounts.none_created"]
};

vi.mock("../hooks/use-financial-diagnostic", () => ({
  useFinancialDiagnostic: (initial: FinancialDiagnostic | null) => ({
    data: initial
  })
}));

describe("OnboardingWizard", () => {
  it("renders progress percentage, next recommended step banner, and checklist", () => {
    render(<OnboardingWizard initialDiagnostic={DIAGNOSTIC_FIXTURE} />);

    expect(screen.getByText("Financial Copilot Readiness")).toBeInTheDocument();
    expect(screen.getByText("Setup Required")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument(); // 2 / 4 = 50%

    expect(
      screen.getByText(/Next Recommended Step: Add Bank or Cash Account/i)
    ).toBeInTheDocument();

    expect(screen.getByText("Financial Copilot Capabilities")).toBeInTheDocument();
    expect(screen.getByText("Prerequisite Diagnostic Checklist")).toBeInTheDocument();
    expect(screen.getByText("Salary & Net Income")).toBeInTheDocument();
    expect(screen.getByText("Bank & Cash Accounts")).toBeInTheDocument();
  });

  it("renders fallback message when diagnostic data is null", () => {
    render(<OnboardingWizard initialDiagnostic={null} />);
    expect(screen.getByText(/Unable to load financial readiness diagnostic/i)).toBeInTheDocument();
  });

  it("renders completion callout and View Dashboard link when all core prerequisites are completed", () => {
    const completedDiagnostic: FinancialDiagnostic = {
      ...DIAGNOSTIC_FIXTURE,
      overallStatus: "ready",
      readyCount: 4,
      totalRequiredCount: 4,
      nextAction: null,
      availableCapabilities: ["salary_statistics", "life_hour", "essential_burn", "safety_ladder"],
      unavailableCapabilities: []
    };

    render(<OnboardingWizard initialDiagnostic={completedDiagnostic} />);

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("All Core Prerequisites Completed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your Financial Runway Clock and Safety Ladder are active on your dashboard."
      )
    ).toBeInTheDocument();
    const dashboardLinks = screen.getAllByRole("link", { name: /View Dashboard/i });
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of dashboardLinks) {
      expect(link).toHaveAttribute("href", "/");
    }
  });
});

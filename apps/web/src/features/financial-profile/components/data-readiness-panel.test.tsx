import type { FinancialDiagnostic } from "@treasury-ops/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataReadinessPanel } from "./data-readiness-panel";

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
  nextAction: "configure_salary",
  items: [
    {
      key: "salary",
      status: "missing",
      attention: "blocking",
      source: "financial_profile",
      lastUpdatedAt: null,
      requiredFor: ["salary_statistics"],
      action: "configure_salary",
      evidence: {
        observedCount: null,
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
      summaryKey: "salary.missing",
      limitationKeys: []
    }
  ],
  limitations: []
};

vi.mock("../hooks/use-financial-diagnostic", () => ({
  useFinancialDiagnostic: (initial: FinancialDiagnostic | null) => ({
    data: initial
  })
}));

describe("DataReadinessPanel", () => {
  it("renders status badge, completion count, and next action link", () => {
    render(<DataReadinessPanel initialDiagnostic={DIAGNOSTIC_FIXTURE} />);

    expect(screen.getByText("Copilot Data Readiness")).toBeInTheDocument();
    expect(screen.getByText("Setup Required")).toBeInTheDocument();
    expect(screen.getByText(/2 of 4 core prerequisites ready/i)).toBeInTheDocument();

    const configureLink = screen.getByRole("link", {
      name: /Configure Salary & Schedule/i
    });
    expect(configureLink).toHaveAttribute("href", "/settings?tab=income");

    const fullDiagLink = screen.getByRole("link", {
      name: /Full Diagnostic/i
    });
    expect(fullDiagLink).toHaveAttribute("href", "/onboarding");
  });

  it("renders null when initialDiagnostic is null and no data returned", () => {
    const { container } = render(<DataReadinessPanel initialDiagnostic={null} />);
    expect(container.firstChild).toBeNull();
  });
});

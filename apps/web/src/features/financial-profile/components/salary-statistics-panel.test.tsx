import { render, screen } from "@testing-library/react";
import type { SalaryStatistics } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { SalaryStatisticsPanel } from "./salary-statistics-panel";

const STATISTICS: SalaryStatistics = {
  currentNetMonthlySalaryMinor: 12_50_000,
  annualizedNetIncomeMinor: 1_50_00_000,
  netHourlyWageMinor: 7_813,
  eightHourWorkdayEquivalentMinor: 62_500,
  effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
  monthlyWorkMinutes: 9_600,
  salaryVersionId: "11111111-1111-4111-8111-111111111111",
  computedAt: new Date("2026-08-16T00:00:00.000Z"),
  formulaVersion: 1,
  dataQuality: "complete",
  assumptions: {
    monthsPerYear: 12,
    minutesPerHour: 60,
    standardWorkdayMinutes: 480,
    monthlyWorkMinutes: 9_600,
    incomeStability: "stable",
    expectedAnnualIncrementBps: null,
    rounding: "half_up"
  },
  limitations: []
};

describe("SalaryStatisticsPanel", () => {
  it("renders the server-computed figures with accessible names", () => {
    render(<SalaryStatisticsPanel statistics={STATISTICS} />);

    expect(screen.getByRole("article", { name: "Current net monthly salary" })).toHaveTextContent(
      "₹12,500.00"
    );
    expect(screen.getByRole("article", { name: "Annualized net income" })).toHaveTextContent(
      "₹1,50,000.00"
    );
    expect(screen.getByRole("article", { name: "Net hourly wage" })).toHaveTextContent("₹78.13");
    expect(
      screen.getByRole("article", { name: "Eight-hour workday equivalent" })
    ).toHaveTextContent("₹625.00");
    expect(screen.getByText("Manually confirmed")).toBeVisible();
    expect(screen.getByText("v1")).toBeVisible();
  });

  it("states the effective date and the data-quality label in text, not colour", () => {
    render(<SalaryStatisticsPanel statistics={STATISTICS} />);

    expect(screen.getByText(/Effective from 1 Apr 2026/)).toBeVisible();
    expect(screen.getByText("Complete")).toBeVisible();
  });

  it("lists limitations when the server reports them", () => {
    render(
      <SalaryStatisticsPanel
        statistics={{
          ...STATISTICS,
          dataQuality: "limited",
          limitations: ["Income is marked variable."]
        }}
      />
    );

    expect(screen.getByText("Limited")).toBeVisible();
    expect(screen.getByText("Income is marked variable.")).toBeVisible();
  });

  it("shows a busy loading state", () => {
    render(<SalaryStatisticsPanel statistics={null} isLoading />);

    const panel = screen.getByRole("region", { name: "Salary statistics" });
    expect(panel).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading salary statistics…")).toBeInTheDocument();
  });

  it("explains a statistics error without implying the saved salary changed", () => {
    render(
      <SalaryStatisticsPanel statistics={null} error={new Error("TreasuryOps is unavailable.")} />
    );

    expect(screen.getByText("Salary statistics unavailable")).toBeVisible();
    expect(screen.getByText(/Your saved salary is unchanged/)).toBeVisible();
  });

  it("announces a background refetch without hiding the current figures", () => {
    render(<SalaryStatisticsPanel statistics={STATISTICS} isStale />);

    expect(screen.getByText("Refreshing…")).toBeVisible();
    expect(screen.getByRole("article", { name: "Net hourly wage" })).toHaveTextContent("₹78.13");
  });

  it("renders nothing when there is no statistics payload and no error", () => {
    const { container } = render(<SalaryStatisticsPanel statistics={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

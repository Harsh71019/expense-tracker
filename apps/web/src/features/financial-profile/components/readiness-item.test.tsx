import type { FinancialReadinessItem } from "@treasury-ops/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReadinessItemCard } from "./readiness-item";

describe("ReadinessItemCard", () => {
  it("renders a ready item with success badge and no action link", () => {
    const item: FinancialReadinessItem = {
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
    };

    render(<ReadinessItemCard item={item} />);

    expect(screen.getByText("Salary & Net Income")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a missing item with blocking badge and direct CTA button", () => {
    const item: FinancialReadinessItem = {
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
    };

    render(<ReadinessItemCard item={item} />);

    expect(screen.getByText("Bank & Cash Accounts")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("Blocking")).toBeInTheDocument();
    expect(screen.getByText("accounts.none_created")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /Add Bank or Cash Account/i });
    expect(link).toHaveAttribute("href", "/accounts");
  });
});

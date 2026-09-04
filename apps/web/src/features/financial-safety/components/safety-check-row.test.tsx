import { render, screen } from "@testing-library/react";
import type { SafetyCheck } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { SafetyCheckRow } from "./safety-check-row";

function check(overrides: Partial<SafetyCheck> = {}): SafetyCheck {
  return {
    key: "term_protection",
    stage: "ground_zero",
    status: "complete",
    attention: "none",
    summaryKey: "term_protection.complete",
    evidence: {
      observedCount: null,
      requiredCount: null,
      coverageMinor: 1_00_00_000,
      benchmarkMinor: 1_00_00_000,
      ratioBps: 10_000,
      activeDebtCount: null,
      highCostDebtCount: null
    },
    limitationKeys: [],
    action: null,
    ...overrides
  };
}

describe("SafetyCheckRow", () => {
  it("renders the check title, status badge, and summary copy", () => {
    render(<SafetyCheckRow check={check()} />);

    expect(screen.getByText("Independent term life cover")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("Independent cover meets the benchmark.")).toBeInTheDocument();
  });

  it("renders attention indicators when attention level is blocking or warning", () => {
    render(
      <SafetyCheckRow
        check={check({
          status: "incomplete",
          attention: "blocking",
          summaryKey: "term_protection.not_configured",
          action: "configure_protection"
        })}
      />
    );

    expect(screen.getByText("Incomplete")).toBeInTheDocument();
    expect(screen.getByText("Blocking")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Set up protection profile/i })).toHaveAttribute(
      "href",
      "/settings?tab=protection"
    );
  });

  it("humanizes limitation keys into accessible explanations", () => {
    render(
      <SafetyCheckRow
        check={check({
          key: "emergency_reserves",
          status: "warning",
          attention: "warning",
          summaryKey: "emergency_reserves.stale_or_missing_present",
          limitationKeys: ["reserve.stale_or_missing_present"]
        })}
      />
    );

    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Attention")).toBeInTheDocument();
    expect(
      screen.getByText("Eligible reserves contain stale or missing valuations")
    ).toBeInTheDocument();
  });
});

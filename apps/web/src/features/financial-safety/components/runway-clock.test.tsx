import { render, screen } from "@testing-library/react";
import type { SafetyEvaluation, SafetyRunway } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { RunwayClock } from "./runway-clock";

let mockPrivacyMode = false;
vi.mock("@/lib/privacy/privacy-context", () => ({
  usePrivacy: () => ({ privacyMode: mockPrivacyMode })
}));

function runway(overrides: Partial<SafetyRunway> = {}): SafetyRunway {
  return {
    availability: "available",
    unavailableReason: null,
    tier: "healthy",
    runwayBasisPoints: 45_000,
    runwayDays: 135,
    eligibleReserveMinor: 4_50_000,
    essentialBurnMinor: 1_00_000,
    observedCompleteMonthCount: 3,
    policyDaysPerMonth: 30,
    criticalThresholdBasisPoints: 30_000,
    fortifiedThresholdBasisPoints: 60_000,
    ...overrides
  };
}

function evaluation(overrides: Partial<SafetyEvaluation> = {}): SafetyEvaluation {
  return {
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
    runway: runway(),
    target: {
      policyTargetMinor: 6_00_000,
      userTargetMinor: null,
      effectiveTargetMinor: 6_00_000,
      targetSource: "policy",
      targetMonths: 6,
      currentGapMinor: 1_50_000,
      currentSurplusMinor: 0
    },
    checks: [],
    limitations: [],
    essentialBurnEvidence: {
      averageMonthlyEssentialMinor: 1_00_000,
      observedCompleteMonthCount: 3,
      quality: "complete"
    },
    reserveEvidence: {
      totalEligibleMinor: 4_50_000,
      instantMinor: 4_50_000,
      tPlusOneMinor: 0,
      lockedMinor: 0,
      staleExcludedMinor: 0,
      currentlyEligibleSourceCount: 1,
      configuredSourceCount: 1
    },
    protectionEvidence: {
      termCoverState: "complete",
      healthCoverState: "complete",
      incomeBasis: "annual_ctc",
      incomeBasisQuality: "confirmed",
      termBenchmarkMinor: 1_00_00_000,
      healthBenchmarkMinor: 15_00_000_00
    },
    debtEvidence: { activeDebtCount: 0, highCostDebtCount: 0 },
    ...overrides
  };
}

describe("RunwayClock", () => {
  it("never renders a fake zero-month result when runway is unavailable", () => {
    render(
      <RunwayClock
        evaluation={evaluation({
          runway: runway({
            availability: "unavailable",
            unavailableReason: "no_eligible_reserve_source",
            tier: "unavailable",
            runwayBasisPoints: null,
            runwayDays: null,
            eligibleReserveMinor: 0,
            essentialBurnMinor: 1_00_000
          }),
          nextAction: "configure_reserves"
        })}
      />
    );

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("0.0")).toBeNull();
    expect(
      screen.getByText(
        /No account or asset is currently classified as an eligible emergency reserve/
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Classify emergency reserves/i })).toHaveAttribute(
      "href",
      "/settings?tab=reserves"
    );
  });

  it("renders the critical tier with its exact required copy", () => {
    render(
      <RunwayClock
        evaluation={evaluation({
          runway: runway({ tier: "critical", runwayBasisPoints: 20_000, runwayDays: 60 })
        })}
      />
    );

    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("2.0")).toBeInTheDocument();
    expect(screen.getByText(/Less than three months of essential runway\./)).toBeInTheDocument();
  });

  it("renders the healthy tier with its exact required copy", () => {
    render(
      <RunwayClock
        evaluation={evaluation({
          runway: runway({ tier: "healthy", runwayBasisPoints: 45_000, runwayDays: 135 })
        })}
      />
    );

    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(
      screen.getByText(/Stable, with less than six months of essential runway\./)
    ).toBeInTheDocument();
  });

  it("renders the fortified tier with its exact required copy", () => {
    render(
      <RunwayClock
        evaluation={evaluation({
          runway: runway({ tier: "fortified", runwayBasisPoints: 90_000, runwayDays: 270 })
        })}
      />
    );

    expect(screen.getByText("Fortified")).toBeInTheDocument();
    expect(screen.getByText("9.0")).toBeInTheDocument();
    expect(screen.getByText(/Your six-month safety benchmark is met\./)).toBeInTheDocument();
  });

  it("surfaces the limited-quality disclaimer with the exact required copy", () => {
    render(<RunwayClock evaluation={evaluation({ quality: "limited" })} />);

    expect(screen.getByText("Estimate based on limited expense history.")).toBeInTheDocument();
  });

  it("provides a text equivalent for the visual scale via an accessible label", () => {
    render(<RunwayClock evaluation={evaluation()} />);

    expect(
      screen.getByRole("img", {
        name: /4\.5 months of runway out of a six-month fortified benchmark/
      })
    ).toBeInTheDocument();
  });

  it("masks reserve and burn amounts in privacy mode", () => {
    mockPrivacyMode = true;
    render(<RunwayClock evaluation={evaluation()} />);
    expect(screen.getAllByText("₹ ••••••").length).toBeGreaterThan(0);
    mockPrivacyMode = false;
  });

  it("never uses guaranteed, risk-free, or permanently-safe language", () => {
    const { container } = render(<RunwayClock evaluation={evaluation()} />);
    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("guaranteed");
    expect(text).not.toContain("risk-free");
    expect(text).not.toContain("permanently safe");
  });
});

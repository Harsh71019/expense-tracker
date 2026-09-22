import { render, screen } from "@testing-library/react";
import type { SafetyEvaluation } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { SafetyLadder } from "./safety-ladder";

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
    nextAction: "configure_reserves",
    runway: {
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
      fortifiedThresholdBasisPoints: 60_000
    },
    target: {
      policyTargetMinor: 6_00_000,
      userTargetMinor: null,
      effectiveTargetMinor: 6_00_000,
      targetSource: "policy",
      targetMonths: 6,
      currentGapMinor: 1_50_000,
      currentSurplusMinor: 0
    },
    checks: [
      {
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
        action: null
      },
      {
        key: "emergency_reserves",
        stage: "building_fortress",
        status: "incomplete",
        attention: "warning",
        summaryKey: "emergency_reserves.configured_but_none_eligible",
        evidence: {
          observedCount: 1,
          requiredCount: null,
          coverageMinor: null,
          benchmarkMinor: null,
          ratioBps: null,
          activeDebtCount: null,
          highCostDebtCount: null
        },
        limitationKeys: ["reserve.configured_but_none_eligible"],
        action: "configure_reserves"
      }
    ],
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

describe("SafetyLadder", () => {
  it("renders all four stages with their titles and descriptions", () => {
    render(<SafetyLadder evaluation={evaluation()} />);

    expect(screen.getByText("Safety ladder")).toBeInTheDocument();
    expect(screen.getByText("Ground Zero")).toBeInTheDocument();
    expect(screen.getByText("Building Fortress")).toBeInTheDocument();
    expect(screen.getByText("Buffer Layer")).toBeInTheDocument();
    expect(screen.getByText("Wealth Ready")).toBeInTheDocument();

    expect(
      screen.getByText("Protection is configured and no high-cost debt remains.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Essential burn and eligible reserves are building toward the runway target."
      )
    ).toBeInTheDocument();
  });

  it("marks the current stage with a Current badge", () => {
    render(<SafetyLadder evaluation={evaluation({ currentStage: "building_fortress" })} />);

    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("renders checks grouped under their respective stages", () => {
    render(<SafetyLadder evaluation={evaluation()} />);

    expect(screen.getByText("Independent term life cover")).toBeInTheDocument();
    expect(screen.getByText("Emergency reserve sources")).toBeInTheDocument();
  });

  it("displays the Wealth Ready disclosure explaining that sinking-fund readiness is not assessable yet", () => {
    render(<SafetyLadder evaluation={evaluation()} />);

    expect(
      screen.getByText(
        /Wealth Ready requires sinking-fund readiness, which explicit sinking-fund classification will make assessable in a future release/
      )
    ).toBeInTheDocument();
  });
});

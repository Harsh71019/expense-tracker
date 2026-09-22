import { fireEvent, render, screen } from "@testing-library/react";
import type { SafetyEvaluation } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { SafetyEvidenceDrawer } from "./safety-evidence-drawer";

const mockPrivacyMode = false;
vi.mock("@/lib/privacy/privacy-context", () => ({
  usePrivacy: () => ({ privacyMode: mockPrivacyMode })
}));

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
    limitations: ["reserve.stale_or_missing_present"],
    essentialBurnEvidence: {
      averageMonthlyEssentialMinor: 1_00_000_00,
      observedCompleteMonthCount: 3,
      quality: "complete"
    },
    reserveEvidence: {
      totalEligibleMinor: 4_50_000_00,
      instantMinor: 3_00_000_00,
      tPlusOneMinor: 1_50_000_00,
      lockedMinor: 50_000_00,
      staleExcludedMinor: 20_000_00,
      currentlyEligibleSourceCount: 2,
      configuredSourceCount: 3
    },
    protectionEvidence: {
      termCoverState: "complete",
      healthCoverState: "complete",
      incomeBasis: "annual_ctc",
      incomeBasisQuality: "confirmed",
      termBenchmarkMinor: 10_000_000_00,
      healthBenchmarkMinor: 15_00_000_00
    },
    debtEvidence: { activeDebtCount: 1, highCostDebtCount: 0 },
    ...overrides
  };
}

describe("SafetyEvidenceDrawer", () => {
  it("does not render when open is false or evaluation is null", () => {
    const { container: closedContainer } = render(
      <SafetyEvidenceDrawer open={false} onClose={vi.fn()} evaluation={evaluation()} />
    );
    expect(closedContainer).toBeEmptyDOMElement();

    const { container: nullContainer } = render(
      <SafetyEvidenceDrawer open={true} onClose={vi.fn()} evaluation={null} />
    );
    expect(nullContainer).toBeEmptyDOMElement();
  });

  it("renders the calculation evidence sections and metadata when open", () => {
    render(<SafetyEvidenceDrawer open={true} onClose={vi.fn()} evaluation={evaluation()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Calculation evidence" })).toBeInTheDocument();
    expect(screen.getByText(/Runway formula/i)).toBeInTheDocument();
    expect(screen.getByText(/Safety target/i)).toBeInTheDocument();
    expect(screen.getByText(/Reserve composition/i)).toBeInTheDocument();
    expect(screen.getByText(/Essential burn evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Protection benchmark basis/i)).toBeInTheDocument();
    expect(screen.getByText(/High-cost debt/i)).toBeInTheDocument();
    expect(
      screen.getByText("Eligible reserves contain stale or missing valuations")
    ).toBeInTheDocument();
  });

  it("triggers onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<SafetyEvidenceDrawer open={true} onClose={onClose} evaluation={evaluation()} />);

    fireEvent.click(screen.getByRole("button", { name: /Close calculation evidence/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

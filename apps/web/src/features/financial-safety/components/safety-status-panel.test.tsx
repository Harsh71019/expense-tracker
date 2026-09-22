import { fireEvent, render, screen } from "@testing-library/react";
import type { SafetyEvaluation } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { SafetyStatusPanel } from "./safety-status-panel";

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
    currentStage: "ground_zero",
    nextAction: "configure_protection",
    runway: {
      availability: "unavailable",
      unavailableReason: "no_eligible_reserve_source",
      tier: "unavailable",
      runwayBasisPoints: null,
      runwayDays: null,
      eligibleReserveMinor: 0,
      essentialBurnMinor: null,
      observedCompleteMonthCount: 0,
      policyDaysPerMonth: 30,
      criticalThresholdBasisPoints: 30_000,
      fortifiedThresholdBasisPoints: 60_000
    },
    target: {
      policyTargetMinor: 0,
      userTargetMinor: null,
      effectiveTargetMinor: 0,
      targetSource: "policy",
      targetMonths: 6,
      currentGapMinor: 0,
      currentSurplusMinor: 0
    },
    checks: [
      {
        key: "term_protection",
        stage: "ground_zero",
        status: "incomplete",
        attention: "blocking",
        summaryKey: "term_protection.not_configured",
        evidence: {
          observedCount: null,
          requiredCount: null,
          coverageMinor: null,
          benchmarkMinor: null,
          ratioBps: null,
          activeDebtCount: null,
          highCostDebtCount: null
        },
        limitationKeys: ["term_protection.not_configured"],
        action: "configure_protection"
      }
    ],
    limitations: [],
    essentialBurnEvidence: {
      averageMonthlyEssentialMinor: null,
      observedCompleteMonthCount: 0,
      quality: "unavailable"
    },
    reserveEvidence: {
      totalEligibleMinor: 0,
      instantMinor: 0,
      tPlusOneMinor: 0,
      lockedMinor: 0,
      staleExcludedMinor: 0,
      currentlyEligibleSourceCount: 0,
      configuredSourceCount: 0
    },
    protectionEvidence: {
      termCoverState: "not_configured",
      healthCoverState: "not_configured",
      incomeBasis: "unknown",
      incomeBasisQuality: "unavailable",
      termBenchmarkMinor: null,
      healthBenchmarkMinor: 15_00_000_00
    },
    debtEvidence: { activeDebtCount: 0, highCostDebtCount: 0 },
    ...overrides
  };
}

let mockEvaluationHookReturn: {
  data: SafetyEvaluation | null;
  error: Error | null;
  isFetching: boolean;
} = {
  data: evaluation(),
  error: null,
  isFetching: false
};

const mutateMock = vi.fn();
vi.mock("../hooks/use-safety-evaluation", () => ({
  useSafetyEvaluation: (initial: SafetyEvaluation | null) => ({
    ...mockEvaluationHookReturn,
    data: mockEvaluationHookReturn.data ?? initial
  })
}));
vi.mock("../hooks/use-refresh-safety-evaluation", () => ({
  useRefreshSafetyEvaluation: () => ({
    mutate: mutateMock,
    isPending: false,
    idempotencyKey: "11111111-1111-4111-8111-111111111111"
  })
}));

describe("SafetyStatusPanel", () => {
  it("renders a loading skeleton without replacing the rest of the panel tree", () => {
    mockEvaluationHookReturn = { data: null, error: null, isFetching: false };
    render(<SafetyStatusPanel initialData={null} />);

    expect(screen.queryByText("Safety status")).toBeNull();
    expect(document.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("isolates an API failure to its own error state instead of throwing", () => {
    mockEvaluationHookReturn = { data: null, error: new Error("network down"), isFetching: false };
    render(<SafetyStatusPanel initialData={null} />);

    expect(screen.getByText("Failed to load the Safety Evaluation.")).toBeInTheDocument();
  });

  it("renders the runway clock, ladder, and next action once data is available", () => {
    mockEvaluationHookReturn = { data: evaluation(), error: null, isFetching: false };
    render(<SafetyStatusPanel initialData={evaluation()} />);

    expect(screen.getByText("Safety status")).toBeInTheDocument();
    expect(screen.getByText("Your next safety action")).toBeInTheDocument();
    expect(screen.getByText("Safety ladder")).toBeInTheDocument();
  });

  it("opens the evidence drawer on demand", () => {
    mockEvaluationHookReturn = { data: evaluation(), error: null, isFetching: false };
    render(<SafetyStatusPanel initialData={evaluation()} />);

    fireEvent.click(screen.getByRole("button", { name: /Evidence/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("triggers a refresh mutation when the refresh button is clicked", () => {
    mockEvaluationHookReturn = { data: evaluation(), error: null, isFetching: false };
    render(<SafetyStatusPanel initialData={evaluation()} />);

    fireEvent.click(screen.getByRole("button", { name: /^Refresh$/i }));
    expect(mutateMock).toHaveBeenCalled();
  });
});

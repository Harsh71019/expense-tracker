import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSafetyEvaluation } from "./get-safety-evaluation";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({
  getServerApiClient: mocks.getServerApiClient
}));

const VALID_EVALUATION = {
  evaluationId: "44444444-4444-4444-8444-444444444444",
  snapshotStatus: "live",
  computedAt: "2026-08-18T10:00:00.000Z",
  asOf: "2026-08-18T10:00:00.000Z",
  sourceThrough: "2026-08-01T00:00:00.000Z",
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
  limitations: [],
  essentialBurnEvidence: {
    averageMonthlyEssentialMinor: 1_00_000_00,
    observedCompleteMonthCount: 3,
    quality: "complete"
  },
  reserveEvidence: {
    totalEligibleMinor: 4_50_000_00,
    instantMinor: 3_00_000_00,
    tPlusOneMinor: 1_50_000_00,
    lockedMinor: 0,
    staleExcludedMinor: 0,
    currentlyEligibleSourceCount: 2,
    configuredSourceCount: 2
  },
  protectionEvidence: {
    termCoverState: "complete",
    healthCoverState: "complete",
    incomeBasis: "annual_ctc",
    incomeBasisQuality: "confirmed",
    termBenchmarkMinor: 10_000_000_00,
    healthBenchmarkMinor: 1_500_000_00
  },
  debtEvidence: { activeDebtCount: 0, highCostDebtCount: 0 }
};

describe("getSafetyEvaluation server fetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses valid safety evaluation data correctly", async () => {
    mocks.GET.mockResolvedValueOnce({ data: VALID_EVALUATION });

    const result = await getSafetyEvaluation();

    expect(result).not.toBeNull();
    expect(result?.quality).toBe("complete");
    expect(result?.currentStage).toBe("building_fortress");
    expect(result?.runway.runwayDays).toBe(135);
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-safety/evaluation", {
      params: { query: {} }
    });
  });

  it("passes asOf query parameter when provided", async () => {
    mocks.GET.mockResolvedValueOnce({ data: VALID_EVALUATION });

    const asOfStr = "2026-08-16T00:00:00.000Z";
    await getSafetyEvaluation(asOfStr);

    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-safety/evaluation", {
      params: { query: { asOf: asOfStr } }
    });
  });

  it("fails closed to null on schema validation failure", async () => {
    mocks.GET.mockResolvedValueOnce({ data: { invalid: true } });

    const result = await getSafetyEvaluation();
    expect(result).toBeNull();
  });

  it("fails closed to null on transport error", async () => {
    mocks.GET.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await getSafetyEvaluation();
    expect(result).toBeNull();
  });
});

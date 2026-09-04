import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { SafetyEvaluation } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useSafetyEvaluation } from "./use-safety-evaluation";

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const FIXTURE: SafetyEvaluation = {
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
    healthBenchmarkMinor: 15_00_000_00
  },
  debtEvidence: { activeDebtCount: 0, highCostDebtCount: 0 }
};

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSafetyEvaluation hook", () => {
  it("returns initialData immediately when provided", () => {
    const { result } = renderHook(() => useSafetyEvaluation(FIXTURE), { wrapper });
    expect(result.current.data).toEqual(FIXTURE);
  });

  it("fetches data and parses response when initialData is null", async () => {
    mocks.GET.mockResolvedValueOnce({
      data: {
        ...FIXTURE,
        computedAt: FIXTURE.computedAt.toISOString(),
        asOf: FIXTURE.asOf.toISOString(),
        sourceThrough: FIXTURE.sourceThrough.toISOString()
      },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useSafetyEvaluation(null), { wrapper });

    await waitFor(() => expect(result.current.data?.quality).toBe("complete"));
    expect(result.current.data?.currentStage).toBe("building_fortress");
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-safety/evaluation", {
      params: { query: {} }
    });
  });

  it("passes asOf parameter when provided", async () => {
    const asOf = "2026-08-15";
    mocks.GET.mockResolvedValueOnce({
      data: {
        ...FIXTURE,
        computedAt: FIXTURE.computedAt.toISOString(),
        asOf: FIXTURE.asOf.toISOString(),
        sourceThrough: FIXTURE.sourceThrough.toISOString()
      },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useSafetyEvaluation(null, asOf), { wrapper });

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(mocks.GET).toHaveBeenCalledWith("/v1/financial-safety/evaluation", {
      params: { query: { asOf } }
    });
  });
});

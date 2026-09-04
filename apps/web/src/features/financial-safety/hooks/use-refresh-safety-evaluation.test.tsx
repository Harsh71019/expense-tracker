import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { SafetyEvaluation } from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRefreshSafetyEvaluation } from "./use-refresh-safety-evaluation";

const mocks = vi.hoisted(() => ({ POST: vi.fn() }));
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

describe("useRefreshSafetyEvaluation hook", () => {
  let queryClient: QueryClient;

  function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } }
    });
  });

  it("exposes an idempotency key and invalidates safety query cache on success", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    mocks.POST.mockResolvedValueOnce({
      data: {
        ...FIXTURE,
        computedAt: FIXTURE.computedAt.toISOString(),
        asOf: FIXTURE.asOf.toISOString(),
        sourceThrough: FIXTURE.sourceThrough.toISOString()
      },
      error: undefined,
      response: { status: 200 }
    });

    const { result } = renderHook(() => useRefreshSafetyEvaluation(), { wrapper });
    const initialKey = result.current.idempotencyKey;
    expect(initialKey).toBeTruthy();

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(mocks.POST).toHaveBeenCalledWith("/v1/financial-safety/evaluations/refresh", {
      body: {},
      params: { header: { "Idempotency-Key": initialKey } }
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });

  it("propagates error on failure", async () => {
    mocks.POST.mockRejectedValueOnce(new Error("Service Unavailable"));

    const { result } = renderHook(() => useRefreshSafetyEvaluation(), { wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync(undefined);
      } catch {
        // Expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

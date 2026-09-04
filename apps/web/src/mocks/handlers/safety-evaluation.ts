import type { HttpHandler } from "msw";

import type { MockHttp } from "./types";

const MOCK_SAFETY_EVALUATION = {
  evaluationId: "44444444-4444-4444-8444-444444444444",
  snapshotStatus: "live" as const,
  computedAt: new Date("2026-08-18T10:00:00.000Z").toISOString(),
  asOf: new Date("2026-08-18T10:00:00.000Z").toISOString(),
  sourceThrough: new Date("2026-08-01T00:00:00.000Z").toISOString(),
  formulaVersion: 1,
  policyVersion: 1,
  inputFingerprint: "mock-safety-fingerprint-v1",
  quality: "complete" as const,
  currentStage: "building_fortress" as const,
  nextAction: "configure_reserves" as const,
  runway: {
    availability: "available" as const,
    unavailableReason: null,
    tier: "healthy" as const,
    runwayBasisPoints: 45_000,
    runwayDays: 135,
    eligibleReserveMinor: 450_000_00,
    essentialBurnMinor: 100_000_00,
    observedCompleteMonthCount: 3,
    policyDaysPerMonth: 30,
    criticalThresholdBasisPoints: 30_000,
    fortifiedThresholdBasisPoints: 60_000
  },
  target: {
    policyTargetMinor: 600_000_00,
    userTargetMinor: null,
    effectiveTargetMinor: 600_000_00,
    targetSource: "policy" as const,
    targetMonths: 6,
    currentGapMinor: 150_000_00,
    currentSurplusMinor: 0
  },
  checks: [
    {
      key: "term_protection" as const,
      stage: "ground_zero" as const,
      status: "complete" as const,
      attention: "none" as const,
      summaryKey: "term_protection.complete",
      evidence: {
        observedCount: null,
        requiredCount: null,
        coverageMinor: 10_000_000_00,
        benchmarkMinor: 10_000_000_00,
        ratioBps: 10_000,
        activeDebtCount: null,
        highCostDebtCount: null
      },
      limitationKeys: [],
      action: null
    },
    {
      key: "health_protection" as const,
      stage: "ground_zero" as const,
      status: "complete" as const,
      attention: "none" as const,
      summaryKey: "health_protection.complete",
      evidence: {
        observedCount: null,
        requiredCount: null,
        coverageMinor: 2_500_000_00,
        benchmarkMinor: 1_500_000_00,
        ratioBps: 16_667,
        activeDebtCount: null,
        highCostDebtCount: null
      },
      limitationKeys: [],
      action: null
    },
    {
      key: "high_cost_debt" as const,
      stage: "ground_zero" as const,
      status: "complete" as const,
      attention: "none" as const,
      summaryKey: "high_cost_debt.none",
      evidence: {
        observedCount: null,
        requiredCount: null,
        coverageMinor: null,
        benchmarkMinor: null,
        ratioBps: null,
        activeDebtCount: 0,
        highCostDebtCount: 0
      },
      limitationKeys: [],
      action: null
    },
    {
      key: "essential_burn" as const,
      stage: "building_fortress" as const,
      status: "complete" as const,
      attention: "none" as const,
      summaryKey: "essential_burn.complete",
      evidence: {
        observedCount: 3,
        requiredCount: 3,
        coverageMinor: null,
        benchmarkMinor: null,
        ratioBps: null,
        activeDebtCount: null,
        highCostDebtCount: null
      },
      limitationKeys: [],
      action: null
    },
    {
      key: "emergency_reserves" as const,
      stage: "building_fortress" as const,
      status: "complete" as const,
      attention: "none" as const,
      summaryKey: "emergency_reserves.complete",
      evidence: {
        observedCount: 2,
        requiredCount: null,
        coverageMinor: null,
        benchmarkMinor: null,
        ratioBps: null,
        activeDebtCount: null,
        highCostDebtCount: null
      },
      limitationKeys: [],
      action: null
    },
    {
      key: "emergency_runway" as const,
      stage: "building_fortress" as const,
      status: "incomplete" as const,
      attention: "warning" as const,
      summaryKey: "emergency_runway.below_target",
      evidence: {
        observedCount: null,
        requiredCount: null,
        coverageMinor: 450_000_00,
        benchmarkMinor: 600_000_00,
        ratioBps: 7_500,
        activeDebtCount: null,
        highCostDebtCount: null
      },
      limitationKeys: ["runway.below_target"],
      action: "configure_reserves" as const
    },
    {
      key: "sinking_fund_buffer" as const,
      stage: "buffer_layer" as const,
      status: "not_assessable" as const,
      attention: "information" as const,
      summaryKey: "sinking_fund_buffer.not_assessable",
      evidence: {
        observedCount: null,
        requiredCount: null,
        coverageMinor: null,
        benchmarkMinor: null,
        ratioBps: null,
        activeDebtCount: null,
        highCostDebtCount: null
      },
      limitationKeys: ["sinking_fund.not_assessable"],
      action: null
    }
  ],
  limitations: [],
  essentialBurnEvidence: {
    averageMonthlyEssentialMinor: 100_000_00,
    observedCompleteMonthCount: 3,
    quality: "complete" as const
  },
  reserveEvidence: {
    totalEligibleMinor: 450_000_00,
    instantMinor: 300_000_00,
    tPlusOneMinor: 150_000_00,
    lockedMinor: 0,
    staleExcludedMinor: 0,
    currentlyEligibleSourceCount: 2,
    configuredSourceCount: 2
  },
  protectionEvidence: {
    termCoverState: "complete" as const,
    healthCoverState: "complete" as const,
    incomeBasis: "annual_ctc" as const,
    incomeBasisQuality: "confirmed" as const,
    termBenchmarkMinor: 10_000_000_00,
    healthBenchmarkMinor: 1_500_000_00
  },
  debtEvidence: {
    activeDebtCount: 0,
    highCostDebtCount: 0
  }
};

export function safetyEvaluationHandlers(http: MockHttp): HttpHandler[] {
  return [
    http.get("/v1/financial-safety/evaluation", ({ response }) => {
      return response(200).json(MOCK_SAFETY_EVALUATION);
    }),

    http.post("/v1/financial-safety/evaluations/refresh", ({ response }) => {
      return response(200).json({
        ...MOCK_SAFETY_EVALUATION,
        computedAt: new Date().toISOString()
      });
    })
  ];
}

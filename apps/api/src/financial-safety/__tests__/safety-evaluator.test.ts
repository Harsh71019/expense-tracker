import {
  SAFETY_MIN_HEALTH_COVER_MINOR,
  type EssentialBurnResponse,
  type FinancialProfileState,
  type ProtectionSnapshot,
  type ProtectionState,
  type ReserveSummary,
  type SafetyBufferState,
  type SalaryVersion
} from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { evaluateSafety, type SafetyEvaluatorInput } from "../safety-evaluator.js";

const ASOF = new Date("2026-08-18T00:00:00.000Z");
const COMPUTED_AT = new Date("2026-08-18T00:05:00.000Z");
const SOURCE_THROUGH = new Date("2026-08-01T00:00:00.000Z");

const ESSENTIAL_BURN_MINOR = 1_00_000; // Rs 1,000/month, chosen for clean basis-point arithmetic.

function essentialBurn(overrides: Partial<EssentialBurnResponse> = {}): EssentialBurnResponse {
  return {
    computedAt: COMPUTED_AT,
    asOf: ASOF,
    sourceThrough: SOURCE_THROUGH,
    formulaVersion: 1,
    timezone: "Asia/Kolkata",
    requiredCompleteMonths: 3,
    observedCompleteMonthCount: 3,
    averageMonthlyEssentialMinor: ESSENTIAL_BURN_MINOR,
    quality: "complete",
    completeMonths: [
      {
        month: "2026-05",
        observation: "observed",
        essentialTotalMinor: ESSENTIAL_BURN_MINOR,
        eligibleExpenseTransactionCount: 5,
        essentialTransactionCount: 5
      },
      {
        month: "2026-06",
        observation: "observed",
        essentialTotalMinor: ESSENTIAL_BURN_MINOR,
        eligibleExpenseTransactionCount: 5,
        essentialTransactionCount: 5
      },
      {
        month: "2026-07",
        observation: "observed",
        essentialTotalMinor: ESSENTIAL_BURN_MINOR,
        eligibleExpenseTransactionCount: 5,
        essentialTransactionCount: 5
      }
    ],
    currentPartialMonth: {
      month: "2026-08",
      essentialTotalMinor: 0,
      eligibleExpenseTransactionCount: 0,
      essentialTransactionCount: 0,
      excludedFromBaseline: true
    },
    classification: {
      eligibleExpenseTransactionCount: 15,
      essentialExpenseTransactionCount: 15,
      lifestyleExpenseTransactionCount: 0,
      uncategorizedExpenseCount: 0,
      uncategorizedExpenseMinor: 0,
      ungroupedExpenseCount: 0,
      ungroupedExpenseMinor: 0,
      categorizedExpenseMinor: ESSENTIAL_BURN_MINOR * 3,
      unclassifiedExpenseMinor: 0,
      coverageRatioBps: 10_000,
      currentCategoryMetadataInUse: true
    },
    limitations: [],
    ...overrides
  };
}

function reserves(overrides: Partial<ReserveSummary> = {}): ReserveSummary {
  return {
    computedAt: COMPUTED_AT,
    asOf: ASOF,
    sourceThrough: COMPUTED_AT,
    formulaVersion: 1,
    policyVersion: 1,
    timezone: "Asia/Kolkata",
    configuredSourceCount: 1,
    currentlyEligibleSourceCount: 1,
    instantMinor: 3_00_000,
    tPlusOneMinor: 0,
    totalEligibleMinor: 3_00_000,
    lockedMinor: 0,
    staleExcludedMinor: 0,
    missingValueSourceCount: 0,
    staleSourceCount: 0,
    excludedSourceCount: 0,
    limitations: [],
    ...overrides
  };
}

function baseSnapshot(overrides: Partial<ProtectionSnapshot> = {}): ProtectionSnapshot {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-1",
    effectiveFrom: ASOF,
    termCoverStatus: "independent",
    independentTermCoverMinor: 1_00_00_000,
    employerTermCoverMinor: null,
    independentTermExpiresOn: new Date("2050-01-01T00:00:00.000Z"),
    termNotApplicableReason: null,
    healthCoverStatus: "independent",
    independentHealthBaseCoverMinor: SAFETY_MIN_HEALTH_COVER_MINOR,
    independentHealthSuperTopUpMinor: null,
    employerHealthCoverMinor: null,
    independentHealthExpiresOn: new Date("2050-01-01T00:00:00.000Z"),
    dependantCount: 1,
    createdAt: ASOF,
    ...overrides
  };
}

function protection(overrides: Partial<ProtectionState> = {}): ProtectionState {
  return {
    configured: true,
    currentSnapshot: baseSnapshot(),
    upcomingSnapshot: null,
    asOf: ASOF,
    dataQuality: "complete",
    termCover: {
      state: "complete",
      expiryState: "active",
      expiresOn: new Date("2050-01-01T00:00:00.000Z"),
      hasIndependentCover: true,
      hasEmployerCover: false
    },
    healthCover: {
      state: "complete",
      expiryState: "active",
      expiresOn: new Date("2050-01-01T00:00:00.000Z"),
      hasIndependentCover: true,
      hasEmployerCover: false
    },
    expiringSoonDays: 90,
    limitations: [],
    ...overrides
  };
}

function baseSalaryVersion(overrides: Partial<SalaryVersion> = {}): SalaryVersion {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    userId: "user-1",
    netMonthlySalaryMinor: 1_00_00_000,
    annualCtcMinor: 10_00_000, // benchmark = 10 * 10,00,000 = 1,00,00,000
    effectiveFrom: ASOF,
    source: "manually_confirmed",
    createdAt: ASOF,
    ...overrides
  };
}

function financialProfile(overrides: Partial<FinancialProfileState> = {}): FinancialProfileState {
  return {
    configured: true,
    profile: {
      userId: "user-1",
      monthlyWorkMinutes: 9_600,
      salaryCreditDay: 1,
      expectedAnnualIncrementBps: null,
      incomeStability: "stable",
      createdAt: ASOF,
      updatedAt: ASOF
    },
    currentSalaryVersion: baseSalaryVersion(),
    upcomingSalaryVersion: null,
    suggestedMonthlyWorkMinutes: 9_600,
    asOf: ASOF,
    ...overrides
  };
}

function safetyBuffer(overrides: Partial<SafetyBufferState> = {}): SafetyBufferState {
  return {
    preference: null,
    isFallback: true,
    fallbackPolicy: "zero_balance_default",
    targetMinor: 0,
    liquidBalanceMinor: 0,
    bufferGapMinor: 0,
    bufferSurplusMinor: 0,
    monthlyEssentialOutflowMinor: 0,
    ...overrides
  };
}

function input(overrides: Partial<SafetyEvaluatorInput> = {}): SafetyEvaluatorInput {
  return {
    asOf: ASOF,
    computedAt: COMPUTED_AT,
    sourceThrough: SOURCE_THROUGH,
    essentialBurn: essentialBurn(),
    reserves: reserves(),
    protectionState: protection(),
    financialProfileState: financialProfile(),
    activeDebtCount: 0,
    highCostDebtCount: 0,
    safetyBufferState: safetyBuffer(),
    ...overrides
  };
}

function checkFor(result: ReturnType<typeof evaluateSafety>, key: string) {
  const check = result.checks.find((c) => c.key === key);
  if (check === undefined) throw new Error(`Missing check: ${key}`);
  return check;
}

describe("evaluateSafety runway formula", () => {
  it("is unavailable when essential burn is null", () => {
    const result = evaluateSafety(
      input({
        essentialBurn: essentialBurn({ averageMonthlyEssentialMinor: null, quality: "unavailable" })
      })
    );
    expect(result.runway.availability).toBe("unavailable");
    expect(result.runway.unavailableReason).toBe("essential_burn_unavailable");
    expect(result.runway.tier).toBe("unavailable");
    expect(result.runway.runwayBasisPoints).toBeNull();
  });

  it("is unavailable when essential burn is exactly zero", () => {
    const result = evaluateSafety(
      input({ essentialBurn: essentialBurn({ averageMonthlyEssentialMinor: 0 }) })
    );
    expect(result.runway.availability).toBe("unavailable");
    expect(result.runway.unavailableReason).toBe("essential_burn_zero");
  });

  it("is unavailable when no eligible reserve source exists", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ currentlyEligibleSourceCount: 0, totalEligibleMinor: 0 }) })
    );
    expect(result.runway.availability).toBe("unavailable");
    expect(result.runway.unavailableReason).toBe("no_eligible_reserve_source");
  });

  it("is unavailable when eligible reserves total exactly zero", () => {
    const result = evaluateSafety(
      input({
        reserves: reserves({
          currentlyEligibleSourceCount: 1,
          totalEligibleMinor: 0,
          instantMinor: 0
        })
      })
    );
    expect(result.runway.availability).toBe("unavailable");
    expect(result.runway.unavailableReason).toBe("eligible_reserve_zero");
  });

  it("computes exact basis points and days for a simple ratio", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 4_50_000, instantMinor: 4_50_000 }) })
    );
    // 450000 * 10000 / 100000 = 45000 bps = 4.5 months
    expect(result.runway.runwayBasisPoints).toBe(45_000);
    expect(result.runway.runwayDays).toBe(135); // 450000 * 30 / 100000
    expect(result.runway.tier).toBe("healthy");
  });

  it("is critical strictly below 3 months (30000 bps)", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 2_99_999, instantMinor: 2_99_999 }) })
    );
    expect(result.runway.runwayBasisPoints).toBe(29_999);
    expect(result.runway.tier).toBe("critical");
  });

  it("is healthy at exactly 3 months (30000 bps)", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 3_00_000, instantMinor: 3_00_000 }) })
    );
    expect(result.runway.runwayBasisPoints).toBe(30_000);
    expect(result.runway.tier).toBe("healthy");
  });

  it("is healthy just above 3 months", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 3_10_000, instantMinor: 3_10_000 }) })
    );
    expect(result.runway.tier).toBe("healthy");
  });

  it("is healthy just below 6 months", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 5_99_000, instantMinor: 5_99_000 }) })
    );
    expect(result.runway.runwayBasisPoints).toBe(59_900);
    expect(result.runway.tier).toBe("healthy");
  });

  it("is fortified at exactly 6 months (60000 bps)", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 6_00_000, instantMinor: 6_00_000 }) })
    );
    expect(result.runway.runwayBasisPoints).toBe(60_000);
    expect(result.runway.tier).toBe("fortified");
  });

  it("is fortified above 6 months", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 9_00_000, instantMinor: 9_00_000 }) })
    );
    expect(result.runway.tier).toBe("fortified");
  });

  it("throws when the runway basis-point result would exceed the safe integer range", () => {
    expect(() =>
      evaluateSafety(
        input({
          essentialBurn: essentialBurn({ averageMonthlyEssentialMinor: 1 }),
          reserves: reserves({
            totalEligibleMinor: Number.MAX_SAFE_INTEGER,
            instantMinor: Number.MAX_SAFE_INTEGER
          })
        })
      )
    ).toThrow(RangeError);
  });

  it("produces a byte-identical result for identical inputs (deterministic)", () => {
    const a = evaluateSafety(input());
    const b = evaluateSafety(input());
    expect(a).toEqual(b);
  });

  it("never uses floating-point money math -- runway stays an integer basis-point value", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 3_33_333, instantMinor: 3_33_333 }) })
    );
    expect(Number.isInteger(result.runway.runwayBasisPoints)).toBe(true);
    expect(Number.isInteger(result.runway.runwayDays)).toBe(true);
  });
});

describe("evaluateSafety protection checks", () => {
  it("marks term protection incomplete when not configured", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          configured: false,
          currentSnapshot: null,
          termCover: {
            state: "not_configured",
            expiryState: "not_applicable",
            expiresOn: null,
            hasIndependentCover: false,
            hasEmployerCover: false
          }
        })
      })
    );
    expect(checkFor(result, "term_protection").status).toBe("incomplete");
    expect(checkFor(result, "term_protection").action).toBe("configure_protection");
  });

  it("passes term protection when independent cover is exactly at the 10x benchmark", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          currentSnapshot: {
            ...baseSnapshot(),
            independentTermCoverMinor: 1_00_00_000 // 10 * annualCtcMinor(10,00,000)
          }
        })
      })
    );
    expect(checkFor(result, "term_protection").status).toBe("complete");
  });

  it("fails term protection when independent cover is one paisa below the benchmark", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          currentSnapshot: {
            ...baseSnapshot(),
            independentTermCoverMinor: 99_99_999
          }
        })
      })
    );
    expect(checkFor(result, "term_protection").status).toBe("incomplete");
  });

  it("passes term protection when independent cover is above the benchmark", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          currentSnapshot: { ...baseSnapshot(), independentTermCoverMinor: 2_00_00_000 }
        })
      })
    );
    expect(checkFor(result, "term_protection").status).toBe("complete");
  });

  it("treats employer-only term cover as incomplete for Ground Zero", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          currentSnapshot: {
            ...baseSnapshot(),
            termCoverStatus: "employer_only",
            independentTermCoverMinor: null,
            employerTermCoverMinor: 50_00_000
          }
        })
      })
    );
    expect(checkFor(result, "term_protection").status).toBe("incomplete");
    expect(result.currentStage).toBe("ground_zero");
  });

  it("assesses the independent amount only for `both` cover", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          currentSnapshot: {
            ...baseSnapshot(),
            termCoverStatus: "both",
            independentTermCoverMinor: 1_00_00_000,
            employerTermCoverMinor: 20_00_000
          }
        })
      })
    );
    expect(checkFor(result, "term_protection").status).toBe("complete");
    expect(checkFor(result, "term_protection").evidence.coverageMinor).toBe(1_00_00_000);
  });

  it("passes term protection as not_applicable with a structured reason", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          currentSnapshot: {
            ...baseSnapshot(),
            termCoverStatus: "not_applicable",
            independentTermCoverMinor: null,
            termNotApplicableReason: "no_financial_dependants"
          }
        })
      })
    );
    expect(checkFor(result, "term_protection").status).toBe("not_applicable");
  });

  it("uses annual CTC as the income basis when available", () => {
    const result = evaluateSafety(input());
    expect(result.protectionEvidence.incomeBasis).toBe("annual_ctc");
    expect(result.protectionEvidence.incomeBasisQuality).toBe("confirmed");
    expect(result.protectionEvidence.termBenchmarkMinor).toBe(1_00_00_000);
  });

  it("falls back to annualized net income when CTC is unavailable", () => {
    const result = evaluateSafety(
      input({
        financialProfileState: financialProfile({
          currentSalaryVersion: baseSalaryVersion({
            annualCtcMinor: null,
            netMonthlySalaryMinor: 1_00_000
          })
        })
      })
    );
    expect(result.protectionEvidence.incomeBasis).toBe("annualized_net_income");
    expect(result.protectionEvidence.incomeBasisQuality).toBe("estimated");
    expect(result.protectionEvidence.termBenchmarkMinor).toBe(1_00_000 * 12 * 10);
    expect(result.limitations).toContain("protection.term_cover_uses_net_income_basis");
  });

  it("leaves the income basis unknown when no salary is configured", () => {
    const result = evaluateSafety(
      input({ financialProfileState: financialProfile({ currentSalaryVersion: null }) })
    );
    expect(result.protectionEvidence.incomeBasis).toBe("unknown");
    expect(result.protectionEvidence.incomeBasisQuality).toBe("unavailable");
    expect(checkFor(result, "term_protection").status).toBe("unknown");
    expect(result.nextAction).toBe("configure_salary");
  });

  it("fails independent health cover one paisa below the Rs 15,00,000 benchmark", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          currentSnapshot: {
            ...baseSnapshot(),
            independentHealthBaseCoverMinor: SAFETY_MIN_HEALTH_COVER_MINOR - 1
          }
        })
      })
    );
    expect(checkFor(result, "health_protection").status).toBe("incomplete");
  });

  it("passes independent health cover exactly at the Rs 15,00,000 benchmark", () => {
    const result = evaluateSafety(input());
    expect(checkFor(result, "health_protection").status).toBe("complete");
  });

  it("combines base cover and super top-up toward the health benchmark", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          currentSnapshot: {
            ...baseSnapshot(),
            independentHealthBaseCoverMinor: SAFETY_MIN_HEALTH_COVER_MINOR - 10_00_000,
            independentHealthSuperTopUpMinor: 10_00_000
          }
        })
      })
    );
    expect(checkFor(result, "health_protection").status).toBe("complete");
  });

  it("does not let employer health cover satisfy the independent-cover requirement", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          currentSnapshot: {
            ...baseSnapshot(),
            healthCoverStatus: "employer_only",
            independentHealthBaseCoverMinor: null,
            employerHealthCoverMinor: SAFETY_MIN_HEALTH_COVER_MINOR
          }
        })
      })
    );
    expect(checkFor(result, "health_protection").status).toBe("incomplete");
  });

  it("passes with a warning when independent term cover is expiring soon", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          termCover: { ...protection().termCover, expiryState: "expiring" }
        })
      })
    );
    const check = checkFor(result, "term_protection");
    expect(check.status).toBe("complete");
    expect(check.attention).toBe("warning");
    expect(check.action).toBe("configure_protection");
  });

  it("fails when independent term cover has expired", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          termCover: { ...protection().termCover, expiryState: "expired" }
        })
      })
    );
    expect(checkFor(result, "term_protection").status).toBe("incomplete");
  });
});

describe("evaluateSafety debt checks", () => {
  it("passes Ground Zero's debt check with zero active high-cost debt", () => {
    const result = evaluateSafety(input({ activeDebtCount: 2, highCostDebtCount: 0 }));
    expect(checkFor(result, "high_cost_debt").status).toBe("complete");
  });

  it("blocks Ground Zero when a high-cost debt is present", () => {
    const result = evaluateSafety(input({ activeDebtCount: 1, highCostDebtCount: 1 }));
    expect(checkFor(result, "high_cost_debt").status).toBe("incomplete");
    expect(checkFor(result, "high_cost_debt").action).toBe("review_debts");
    expect(result.currentStage).toBe("ground_zero");
  });
});

describe("evaluateSafety ladder stages", () => {
  it("stays at ground_zero when protection blocks even though debt is clean", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          currentSnapshot: { ...baseSnapshot(), termCoverStatus: "none" }
        })
      })
    );
    expect(result.currentStage).toBe("ground_zero");
  });

  it("stays at ground_zero when debt blocks even though protection is complete", () => {
    const result = evaluateSafety(input({ highCostDebtCount: 1 }));
    expect(result.currentStage).toBe("ground_zero");
  });

  it("still computes runway when Ground Zero fails -- runway is never hidden", () => {
    const result = evaluateSafety(input({ highCostDebtCount: 1 }));
    expect(result.currentStage).toBe("ground_zero");
    expect(result.runway.availability).toBe("available");
    expect(result.runway.runwayBasisPoints).not.toBeNull();
  });

  it("reaches building_fortress once Ground Zero passes and runway is below the 6-month target", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 4_00_000, instantMinor: 4_00_000 }) })
    );
    expect(result.currentStage).toBe("building_fortress");
  });

  it("transitions to buffer_layer once the six-month target is met", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 6_00_000, instantMinor: 6_00_000 }) })
    );
    expect(result.currentStage).toBe("buffer_layer");
  });

  it("stays at ground_zero when Ground Zero passes but runway cannot be calculated", () => {
    const result = evaluateSafety(
      input({
        essentialBurn: essentialBurn({ averageMonthlyEssentialMinor: null, quality: "unavailable" })
      })
    );
    expect(result.currentStage).toBe("ground_zero");
  });

  it("always reports the sinking-fund check as not_assessable", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 9_00_000, instantMinor: 9_00_000 }) })
    );
    const check = checkFor(result, "sinking_fund_buffer");
    expect(check.status).toBe("not_assessable");
    expect(result.limitations).toContain("sinking_fund.taxonomy_unavailable");
  });

  it("never emits wealth_ready in V1, even in the most favorable scenario", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 50_00_000, instantMinor: 50_00_000 }) })
    );
    expect(result.currentStage).not.toBe("wealth_ready");
    expect(result.currentStage).toBe("buffer_layer");
  });

  it("never returns a fractional or numeric safety score", () => {
    const result = evaluateSafety(input());
    expect(typeof result.currentStage).toBe("string");
    expect(result).not.toHaveProperty("score");
    expect(result).not.toHaveProperty("percentComplete");
  });
});

describe("evaluateSafety next-action ordering", () => {
  it("prioritizes configure_salary over every other gap", () => {
    const result = evaluateSafety(
      input({
        financialProfileState: financialProfile({ currentSalaryVersion: null }),
        highCostDebtCount: 1
      })
    );
    expect(result.nextAction).toBe("configure_salary");
  });

  it("prioritizes configure_protection over debt once income basis is known", () => {
    const result = evaluateSafety(
      input({
        protectionState: protection({
          currentSnapshot: { ...baseSnapshot(), termCoverStatus: "none" }
        }),
        highCostDebtCount: 1
      })
    );
    expect(result.nextAction).toBe("configure_protection");
  });

  it("prioritizes review_debts once protection is satisfied", () => {
    const result = evaluateSafety(input({ highCostDebtCount: 1 }));
    expect(result.nextAction).toBe("review_debts");
  });

  it("resolves to none when everything above Ground Zero is satisfied and the buffer target is met", () => {
    const result = evaluateSafety(
      input({
        safetyBufferState: safetyBuffer({
          isFallback: false,
          preference: {
            id: "33333333-3333-4333-8333-333333333333",
            userId: "user-1",
            version: 1,
            mode: "fixed_amount",
            amountMinor: 3_00_000,
            months: null,
            emergencyFundGoalId: null,
            effectiveFrom: ASOF,
            createdAt: ASOF
          },
          targetMinor: 3_00_000
        }),
        reserves: reserves({ totalEligibleMinor: 9_00_000, instantMinor: 9_00_000 })
      })
    );
    expect(result.nextAction).toBe("none");
  });

  it("suggests configure_safety_buffer when below the policy target and no explicit preference is set", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ totalEligibleMinor: 4_00_000, instantMinor: 4_00_000 }) })
    );
    expect(result.currentStage).toBe("building_fortress");
    expect(result.nextAction).toBe("configure_safety_buffer");
  });
});

describe("evaluateSafety quality", () => {
  it("is complete with no limitations for a fully clean scenario", () => {
    const result = evaluateSafety(input());
    // Sinking-fund taxonomy is always an explicit limitation in V1.
    expect(result.limitations).toEqual(["sinking_fund.taxonomy_unavailable"]);
    expect(result.quality).toBe("limited");
  });

  it("is limited when Essential Burn quality is limited", () => {
    const result = evaluateSafety(input({ essentialBurn: essentialBurn({ quality: "limited" }) }));
    expect(result.quality).toBe("limited");
    expect(result.limitations).toContain("essential_burn.limited");
  });

  it("is limited when reserve sources carry stale valuations", () => {
    const result = evaluateSafety(
      input({ reserves: reserves({ limitations: ["stale_valuations_present"] }) })
    );
    expect(result.quality).toBe("limited");
    expect(result.limitations).toContain("reserve.stale_valuations_present");
    expect(checkFor(result, "emergency_reserves").action).toBe("refresh_asset_valuations");
  });
});

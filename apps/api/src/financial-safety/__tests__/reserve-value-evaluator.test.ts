import { describe, expect, it } from "vitest";

import {
  evaluateReserveCandidate,
  evaluateReserveSources,
  type ReserveCandidateFact
} from "../reserve-value-evaluator.js";

const ASOF = new Date("2026-08-18T00:00:00.000Z");

function account(overrides: Partial<ReserveCandidateFact> = {}): ReserveCandidateFact {
  return {
    sourceKind: "account",
    sourceId: "11111111-1111-4111-8111-111111111111",
    displayName: "HDFC Savings",
    sourceType: "bank",
    isUnavailable: false,
    currentValueMinor: 100_000,
    valuedAt: null,
    freshnessThresholdDays: null,
    lastUpdatedAt: ASOF,
    configuration: {
      liquidityTier: "instant",
      isIncluded: true,
      eligibleCapMinor: null,
      effectiveFrom: ASOF,
      configuredAt: ASOF
    },
    ...overrides
  };
}

function asset(overrides: Partial<ReserveCandidateFact> = {}): ReserveCandidateFact {
  return {
    sourceKind: "asset",
    sourceId: "22222222-2222-4222-8222-222222222222",
    displayName: "SBI FD",
    sourceType: "fixed_deposit",
    isUnavailable: false,
    currentValueMinor: 200_000,
    valuedAt: new Date("2026-08-01T00:00:00.000Z"),
    freshnessThresholdDays: 180,
    lastUpdatedAt: ASOF,
    configuration: {
      liquidityTier: "t_plus_1",
      isIncluded: true,
      eligibleCapMinor: null,
      effectiveFrom: ASOF,
      configuredAt: ASOF
    },
    ...overrides
  };
}

describe("evaluateReserveCandidate", () => {
  it("counts a positive included instant account balance in full", () => {
    const result = evaluateReserveCandidate(account(), ASOF);
    expect(result.eligibility).toBe("eligible");
    expect(result.exclusionReason).toBe("none");
    expect(result.eligibleMinor).toBe(100_000);
    expect(result.freshness).toBe("not_applicable");
  });

  it("excludes a zero-balance account as non_positive_value", () => {
    const result = evaluateReserveCandidate(account({ currentValueMinor: 0 }), ASOF);
    expect(result.eligibility).toBe("ineligible");
    expect(result.exclusionReason).toBe("non_positive_value");
    expect(result.eligibleMinor).toBe(0);
  });

  it("excludes a negative-balance account as non_positive_value", () => {
    const result = evaluateReserveCandidate(account({ currentValueMinor: -5_000 }), ASOF);
    expect(result.exclusionReason).toBe("non_positive_value");
    expect(result.eligibleMinor).toBe(0);
  });

  it("caps eligible value when the configured cap is lower than the current value", () => {
    const result = evaluateReserveCandidate(
      account({
        currentValueMinor: 500_000,
        configuration: {
          liquidityTier: "instant",
          isIncluded: true,
          eligibleCapMinor: 100_000,
          effectiveFrom: ASOF,
          configuredAt: ASOF
        }
      }),
      ASOF
    );
    expect(result.eligibleMinor).toBe(100_000);
    expect(result.eligibility).toBe("eligible");
  });

  it("caps eligible value at the current value when the cap exceeds it", () => {
    const result = evaluateReserveCandidate(
      account({
        currentValueMinor: 50_000,
        configuration: {
          liquidityTier: "instant",
          isIncluded: true,
          eligibleCapMinor: 999_999_999,
          effectiveFrom: ASOF,
          configuredAt: ASOF
        }
      }),
      ASOF
    );
    expect(result.eligibleMinor).toBe(50_000);
  });

  it("excludes an unconfigured candidate as not_configured", () => {
    const result = evaluateReserveCandidate(account({ configuration: null }), ASOF);
    expect(result.exclusionReason).toBe("not_configured");
    expect(result.eligibility).toBe("ineligible");
  });

  it("excludes a source the user marked isIncluded=false as user_excluded", () => {
    const result = evaluateReserveCandidate(
      account({
        configuration: {
          liquidityTier: "instant",
          isIncluded: false,
          eligibleCapMinor: null,
          effectiveFrom: ASOF,
          configuredAt: ASOF
        }
      }),
      ASOF
    );
    expect(result.exclusionReason).toBe("user_excluded");
  });

  it("excludes a locked-tier source from the eligible amount", () => {
    const result = evaluateReserveCandidate(
      account({
        configuration: {
          liquidityTier: "locked",
          isIncluded: true,
          eligibleCapMinor: null,
          effectiveFrom: ASOF,
          configuredAt: ASOF
        }
      }),
      ASOF
    );
    expect(result.exclusionReason).toBe("locked");
    expect(result.eligibleMinor).toBe(0);
  });

  it("excludes an archived account regardless of configuration", () => {
    const result = evaluateReserveCandidate(account({ isUnavailable: true }), ASOF);
    expect(result.exclusionReason).toBe("archived_account");
    expect(result.eligibleMinor).toBe(0);
  });

  it("excludes a closed asset regardless of configuration", () => {
    const result = evaluateReserveCandidate(asset({ isUnavailable: true }), ASOF);
    expect(result.exclusionReason).toBe("closed_asset");
  });

  it("excludes an asset with no valuation as missing_valuation", () => {
    const result = evaluateReserveCandidate(
      asset({ currentValueMinor: null, valuedAt: null }),
      ASOF
    );
    expect(result.exclusionReason).toBe("missing_valuation");
    expect(result.freshness).toBe("missing");
  });

  it("excludes an asset valuation older than its freshness threshold as stale_valuation", () => {
    const result = evaluateReserveCandidate(
      asset({
        valuedAt: new Date("2026-01-01T00:00:00.000Z"),
        freshnessThresholdDays: 180
      }),
      ASOF
    );
    expect(result.freshness).toBe("stale");
    expect(result.exclusionReason).toBe("stale_valuation");
    expect(result.eligibleMinor).toBe(0);
  });

  it("includes an asset valuation inside the freshness threshold", () => {
    const result = evaluateReserveCandidate(
      asset({
        valuedAt: new Date("2026-07-01T00:00:00.000Z"),
        freshnessThresholdDays: 180
      }),
      ASOF
    );
    expect(result.freshness).toBe("fresh");
    expect(result.eligibility).toBe("eligible");
    expect(result.eligibleMinor).toBe(200_000);
  });

  it("always treats an account's freshness as not_applicable", () => {
    const result = evaluateReserveCandidate(account(), ASOF);
    expect(result.freshness).toBe("not_applicable");
  });

  it("excludes loan_liability assets as unsupported_asset_kind, ignoring configuration", () => {
    const result = evaluateReserveCandidate(
      asset({ sourceType: "loan_liability", currentValueMinor: -100_000 }),
      ASOF
    );
    expect(result.exclusionReason).toBe("unsupported_asset_kind");
    expect(result.eligibleMinor).toBe(0);
  });

  it("excludes loan_receivable assets as unsupported_asset_kind", () => {
    const result = evaluateReserveCandidate(asset({ sourceType: "loan_receivable" }), ASOF);
    expect(result.exclusionReason).toBe("unsupported_asset_kind");
  });

  it("excludes credit_card accounts as unsupported_account_type, ignoring configuration", () => {
    const result = evaluateReserveCandidate(
      account({ sourceType: "credit_card", currentValueMinor: -50_000 }),
      ASOF
    );
    expect(result.exclusionReason).toBe("unsupported_account_type");
  });

  it("excludes investment accounts as potential_double_count", () => {
    const result = evaluateReserveCandidate(account({ sourceType: "investment" }), ASOF);
    expect(result.exclusionReason).toBe("potential_double_count");
  });

  it("locks gold assets out of the eligible total per the gold/silver policy display", () => {
    const result = evaluateReserveCandidate(
      asset({
        sourceType: "gold",
        configuration: {
          liquidityTier: "locked",
          isIncluded: true,
          eligibleCapMinor: null,
          effectiveFrom: ASOF,
          configuredAt: ASOF
        }
      }),
      ASOF
    );
    expect(result.exclusionReason).toBe("locked");
    expect(result.eligibleMinor).toBe(0);
  });

  it("locks silver assets out of the eligible total", () => {
    const result = evaluateReserveCandidate(
      asset({
        sourceType: "silver",
        configuration: {
          liquidityTier: "locked",
          isIncluded: true,
          eligibleCapMinor: null,
          effectiveFrom: ASOF,
          configuredAt: ASOF
        }
      }),
      ASOF
    );
    expect(result.exclusionReason).toBe("locked");
  });

  it("counts an investment asset with a fresh valuation classified T+1", () => {
    const result = evaluateReserveCandidate(
      asset({
        sourceType: "investment",
        valuedAt: new Date("2026-08-10T00:00:00.000Z"),
        freshnessThresholdDays: 90,
        configuration: {
          liquidityTier: "t_plus_1",
          isIncluded: true,
          eligibleCapMinor: null,
          effectiveFrom: ASOF,
          configuredAt: ASOF
        }
      }),
      ASOF
    );
    expect(result.eligibility).toBe("eligible");
    expect(result.eligibleMinor).toBe(200_000);
  });

  it("rejects a value beyond Number.MAX_SAFE_INTEGER via schema parsing", () => {
    expect(() =>
      evaluateReserveCandidate(account({ currentValueMinor: Number.MAX_SAFE_INTEGER + 10 }), ASOF)
    ).toThrow();
  });
});

describe("evaluateReserveSources aggregate", () => {
  it("sums instant and T+1 totals separately and combines them into totalEligibleMinor", () => {
    const { summary } = evaluateReserveSources({
      candidates: [
        account({ currentValueMinor: 100_000 }), // instant
        asset({ currentValueMinor: 200_000 }) // t_plus_1
      ],
      asOf: ASOF
    });
    expect(summary.instantMinor).toBe(100_000);
    expect(summary.tPlusOneMinor).toBe(200_000);
    expect(summary.totalEligibleMinor).toBe(300_000);
    expect(summary.currentlyEligibleSourceCount).toBe(2);
  });

  it("never lets a locked source enter instant/T+1/total eligible totals", () => {
    const lockedAccountId = "33333333-3333-4333-8333-333333333333";
    const { summary, sources } = evaluateReserveSources({
      candidates: [
        account({
          sourceId: lockedAccountId,
          currentValueMinor: 400_000,
          configuration: {
            liquidityTier: "locked",
            isIncluded: true,
            eligibleCapMinor: null,
            effectiveFrom: ASOF,
            configuredAt: ASOF
          }
        })
      ],
      asOf: ASOF
    });
    expect(summary.instantMinor).toBe(0);
    expect(summary.tPlusOneMinor).toBe(0);
    expect(summary.totalEligibleMinor).toBe(0);
    expect(summary.lockedMinor).toBe(400_000);
    expect(sources[0]?.eligibleMinor).toBe(0);
    expect(summary.limitations).toContain("locked_sources_present");
  });

  it("reports staleExcludedMinor for informational display without counting it eligible", () => {
    const { summary } = evaluateReserveSources({
      candidates: [
        asset({
          currentValueMinor: 150_000,
          valuedAt: new Date("2026-01-01T00:00:00.000Z"),
          freshnessThresholdDays: 90
        })
      ],
      asOf: ASOF
    });
    expect(summary.totalEligibleMinor).toBe(0);
    expect(summary.staleExcludedMinor).toBe(150_000);
    expect(summary.staleSourceCount).toBe(1);
    expect(summary.limitations).toContain("stale_valuations_present");
  });

  it("produces deterministic ordering by sourceKind then sourceId regardless of input order", () => {
    const a = asset({ sourceId: "99999999-9999-4999-8999-999999999999" });
    const b = account({ sourceId: "00000000-0000-4000-8000-000000000000" });
    const { sources: order1 } = evaluateReserveSources({ candidates: [a, b], asOf: ASOF });
    const { sources: order2 } = evaluateReserveSources({ candidates: [b, a], asOf: ASOF });
    expect(order1.map((s) => `${s.sourceKind}:${s.sourceId}`)).toEqual(
      order2.map((s) => `${s.sourceKind}:${s.sourceId}`)
    );
    expect(order1[0]?.sourceKind).toBe("account");
    expect(order1[1]?.sourceKind).toBe("asset");
  });

  it("never double counts a source's eligible value across categories", () => {
    const { summary } = evaluateReserveSources({
      candidates: [account({ currentValueMinor: 100_000 })],
      asOf: ASOF
    });
    // The one eligible instant source's value appears in instantMinor and
    // totalEligibleMinor only -- never simultaneously in lockedMinor or
    // staleExcludedMinor.
    expect(summary.instantMinor).toBe(100_000);
    expect(summary.totalEligibleMinor).toBe(100_000);
    expect(summary.lockedMinor).toBe(0);
    expect(summary.staleExcludedMinor).toBe(0);
  });

  it("reports no_candidates_available when there are no sources at all", () => {
    const { summary } = evaluateReserveSources({ candidates: [], asOf: ASOF });
    expect(summary.limitations).toContain("no_candidates_available");
    expect(summary.configuredSourceCount).toBe(0);
    expect(summary.currentlyEligibleSourceCount).toBe(0);
  });

  it("reports no_sources_configured when candidates exist but none are configured", () => {
    const { summary } = evaluateReserveSources({
      candidates: [account({ configuration: null })],
      asOf: ASOF
    });
    expect(summary.limitations).toContain("no_sources_configured");
  });

  it("reports configured_but_none_eligible when every configured source is excluded", () => {
    const { summary } = evaluateReserveSources({
      candidates: [account({ currentValueMinor: 0 })],
      asOf: ASOF
    });
    expect(summary.limitations).toContain("configured_but_none_eligible");
    expect(summary.excludedSourceCount).toBe(1);
  });

  it("returns only safe-integer aggregate totals", () => {
    const { summary } = evaluateReserveSources({
      candidates: [account({ currentValueMinor: 900_000_000_000_000 })],
      asOf: ASOF
    });
    expect(Number.isSafeInteger(summary.instantMinor)).toBe(true);
    expect(Number.isSafeInteger(summary.totalEligibleMinor)).toBe(true);
  });
});

import type { ReserveSource } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  formatValuationAge,
  getExclusionCopy,
  getFreshnessLabel,
  groupReserveSources,
  isRemovingLastEligibleSource,
  isStructurallyUnsupported,
  sourceTypeLabel
} from "./reserve-presentation.js";

const ASOF = new Date("2026-08-18T00:00:00.000Z");

function source(overrides: Partial<ReserveSource> = {}): ReserveSource {
  return {
    sourceKind: "account",
    sourceId: "11111111-1111-4111-8111-111111111111",
    displayName: "HDFC Savings",
    sourceType: "bank",
    configuration: {
      liquidityTier: "instant",
      isIncluded: true,
      eligibleCapMinor: null,
      effectiveFrom: ASOF,
      configuredAt: ASOF
    },
    currentValueMinor: 100_000,
    valuedAt: null,
    freshness: "not_applicable",
    eligibleMinor: 100_000,
    eligibility: "eligible",
    exclusionReason: "none",
    isUnavailable: false,
    lastUpdatedAt: ASOF,
    ...overrides
  };
}

describe("groupReserveSources", () => {
  it("groups an eligible instant source into instant", () => {
    const grouped = groupReserveSources([source()]);
    expect(grouped.instant).toHaveLength(1);
    expect(grouped.tPlusOne).toHaveLength(0);
  });

  it("groups an eligible t_plus_1 source into tPlusOne", () => {
    const grouped = groupReserveSources([
      source({
        configuration: {
          liquidityTier: "t_plus_1",
          isIncluded: true,
          eligibleCapMinor: null,
          effectiveFrom: ASOF,
          configuredAt: ASOF
        }
      })
    ]);
    expect(grouped.tPlusOne).toHaveLength(1);
  });

  it("groups a locked source into lockedOrExcluded, never into instant or tPlusOne", () => {
    const grouped = groupReserveSources([
      source({
        exclusionReason: "locked",
        eligibility: "ineligible",
        eligibleMinor: 0,
        configuration: {
          liquidityTier: "locked",
          isIncluded: true,
          eligibleCapMinor: null,
          effectiveFrom: ASOF,
          configuredAt: ASOF
        }
      })
    ]);
    expect(grouped.lockedOrExcluded).toHaveLength(1);
    expect(grouped.instant).toHaveLength(0);
    expect(grouped.tPlusOne).toHaveLength(0);
  });

  it("groups an unconfigured candidate into availableUnconfigured", () => {
    const grouped = groupReserveSources([
      source({
        configuration: null,
        exclusionReason: "not_configured",
        eligibility: "ineligible",
        eligibleMinor: 0
      })
    ]);
    expect(grouped.availableUnconfigured).toHaveLength(1);
  });

  it("groups a stale or missing valuation into unavailableStaleOrMissing even if a cap is also set", () => {
    const grouped = groupReserveSources([
      source({
        sourceKind: "asset",
        sourceType: "fixed_deposit",
        exclusionReason: "stale_valuation",
        eligibility: "ineligible",
        eligibleMinor: 0,
        freshness: "stale",
        valuedAt: new Date("2026-01-01T00:00:00.000Z")
      })
    ]);
    expect(grouped.unavailableStaleOrMissing).toHaveLength(1);
    expect(grouped.lockedOrExcluded).toHaveLength(0);
  });

  it("keeps an account and an asset with the same UUID distinct in different groups", () => {
    const sharedId = "22222222-2222-4222-8222-222222222222";
    const grouped = groupReserveSources([
      source({ sourceId: sharedId, sourceKind: "account" }),
      source({
        sourceId: sharedId,
        sourceKind: "asset",
        configuration: null,
        exclusionReason: "not_configured",
        eligibility: "ineligible",
        eligibleMinor: 0
      })
    ]);
    expect(grouped.instant).toHaveLength(1);
    expect(grouped.availableUnconfigured).toHaveLength(1);
  });
});

describe("isStructurallyUnsupported", () => {
  it("flags the three structural reasons", () => {
    expect(isStructurallyUnsupported("unsupported_account_type")).toBe(true);
    expect(isStructurallyUnsupported("unsupported_asset_kind")).toBe(true);
    expect(isStructurallyUnsupported("potential_double_count")).toBe(true);
  });

  it("does not flag ordinary reasons", () => {
    expect(isStructurallyUnsupported("none")).toBe(false);
    expect(isStructurallyUnsupported("stale_valuation")).toBe(false);
  });
});

describe("getExclusionCopy / getFreshnessLabel", () => {
  it("returns copy for every exclusion reason", () => {
    expect(getExclusionCopy("locked").label).toContain("Locked");
    expect(getExclusionCopy("missing_valuation").tone).toBe("warning");
  });

  it("returns an empty label for not_applicable freshness", () => {
    expect(getFreshnessLabel("not_applicable")).toBe("");
    expect(getFreshnessLabel("fresh")).toBe("Fresh");
    expect(getFreshnessLabel("stale")).toBe("Stale");
    expect(getFreshnessLabel("missing")).toBe("No valuation");
  });
});

describe("formatValuationAge", () => {
  it("reports no valuation when valuedAt is null", () => {
    expect(formatValuationAge(null, ASOF)).toBe("No valuation recorded");
  });

  it("reports today for a same-day valuation", () => {
    expect(formatValuationAge(ASOF, ASOF)).toBe("Valued today");
  });

  it("reports singular phrasing for one day", () => {
    const yesterday = new Date(ASOF.getTime() - 24 * 60 * 60 * 1000);
    expect(formatValuationAge(yesterday, ASOF)).toBe("Valued 1 day ago");
  });

  it("reports plural phrasing for multiple days", () => {
    const tenDaysAgo = new Date(ASOF.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(formatValuationAge(tenDaysAgo, ASOF)).toBe("Valued 10 days ago");
  });
});

describe("sourceTypeLabel", () => {
  it("title-cases a snake_case source type", () => {
    expect(sourceTypeLabel("fixed_deposit")).toBe("Fixed Deposit");
    expect(sourceTypeLabel("bank")).toBe("Bank");
  });
});

describe("isRemovingLastEligibleSource", () => {
  it("returns false when the change keeps the source eligible", () => {
    const sources = [source()];
    expect(isRemovingLastEligibleSource(sources, sources[0]?.sourceId ?? "", true)).toBe(false);
  });

  it("returns true when this is the only eligible source and it is being removed", () => {
    const sources = [source()];
    expect(isRemovingLastEligibleSource(sources, sources[0]?.sourceId ?? "", false)).toBe(true);
  });

  it("returns false when another eligible source remains", () => {
    const other = source({ sourceId: "33333333-3333-4333-8333-333333333333" });
    const sources = [source(), other];
    expect(isRemovingLastEligibleSource(sources, sources[0]?.sourceId ?? "", false)).toBe(false);
  });
});

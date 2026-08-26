import type { SafetyRunway } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  criticalMarkerRatio,
  formatRunwayDays,
  formatRunwayMonths,
  getRunwayTierCopy,
  getRunwayUnavailableCopy,
  runwayGeometryRatio
} from "./runway-presentation.js";

function runway(overrides: Partial<SafetyRunway> = {}): SafetyRunway {
  return {
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
    fortifiedThresholdBasisPoints: 60_000,
    ...overrides
  };
}

describe("formatRunwayMonths", () => {
  it("formats an exact whole-month value with a zero tenths digit", () => {
    expect(formatRunwayMonths(40_000)).toBe("4.0");
  });

  it("formats a fractional month value to one decimal place", () => {
    expect(formatRunwayMonths(45_000)).toBe("4.5");
  });

  it("formats zero basis points", () => {
    expect(formatRunwayMonths(0)).toBe("0.0");
  });
});

describe("formatRunwayDays", () => {
  it("uses singular wording for exactly one day", () => {
    expect(formatRunwayDays(1)).toBe("1 day");
  });

  it("uses plural wording otherwise", () => {
    expect(formatRunwayDays(0)).toBe("0 days");
    expect(formatRunwayDays(135)).toBe("135 days");
  });
});

describe("runwayGeometryRatio", () => {
  it("returns 0 when runway is unavailable", () => {
    expect(
      runwayGeometryRatio(
        runway({ availability: "unavailable", runwayBasisPoints: null, tier: "unavailable" })
      )
    ).toBe(0);
  });

  it("scales linearly against the fortified threshold below the cap", () => {
    expect(runwayGeometryRatio(runway({ runwayBasisPoints: 30_000 }))).toBeCloseTo(0.5);
  });

  it("caps at 1 for a runway at or beyond the fortified threshold", () => {
    expect(runwayGeometryRatio(runway({ runwayBasisPoints: 60_000 }))).toBe(1);
    expect(runwayGeometryRatio(runway({ runwayBasisPoints: 120_000 }))).toBe(1);
  });
});

describe("criticalMarkerRatio", () => {
  it("places the critical marker at half the fortified threshold under policy version 1", () => {
    expect(criticalMarkerRatio(runway())).toBeCloseTo(0.5);
  });
});

describe("getRunwayTierCopy", () => {
  it("never says guaranteed, risk-free, or permanently safe for any tier", () => {
    for (const tier of ["critical", "healthy", "fortified", "unavailable"] as const) {
      const copy = getRunwayTierCopy(tier);
      const text = `${copy.label} ${copy.headline} ${copy.description}`.toLowerCase();
      expect(text).not.toContain("guaranteed");
      expect(text).not.toContain("risk-free");
      expect(text).not.toContain("permanently safe");
    }
  });

  it("returns the exact required copy examples for each tier", () => {
    expect(getRunwayTierCopy("critical").headline).toBe(
      "Less than three months of essential runway."
    );
    expect(getRunwayTierCopy("healthy").headline).toBe(
      "Stable, with less than six months of essential runway."
    );
    expect(getRunwayTierCopy("fortified").headline).toBe("Your six-month safety benchmark is met.");
  });
});

describe("getRunwayUnavailableCopy", () => {
  it("returns a distinct message per unavailable reason", () => {
    const reasons = [
      "essential_burn_unavailable",
      "essential_burn_zero",
      "no_eligible_reserve_source",
      "eligible_reserve_zero"
    ] as const;
    const messages = new Set(reasons.map((reason) => getRunwayUnavailableCopy(reason)));
    expect(messages.size).toBe(reasons.length);
  });

  it("falls back to a generic message for a null reason", () => {
    expect(getRunwayUnavailableCopy(null)).toBeTruthy();
  });
});

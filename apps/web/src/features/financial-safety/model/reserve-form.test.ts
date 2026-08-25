import type { ReserveSource } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  initialReserveSourceFormValues,
  parseReserveSourceForm,
  previewEligibleMinor
} from "./reserve-form.js";

const ASOF = new Date("2026-08-18T00:00:00.000Z");

function unconfiguredSource(): ReserveSource {
  return {
    sourceKind: "account",
    sourceId: "11111111-1111-4111-8111-111111111111",
    displayName: "HDFC Savings",
    sourceType: "bank",
    configuration: null,
    currentValueMinor: 100_000,
    valuedAt: null,
    freshness: "not_applicable",
    eligibleMinor: 0,
    eligibility: "ineligible",
    exclusionReason: "not_configured",
    isUnavailable: false,
    lastUpdatedAt: ASOF
  };
}

describe("initialReserveSourceFormValues", () => {
  it("defaults to instant + included + no cap for an unconfigured candidate", () => {
    const values = initialReserveSourceFormValues(unconfiguredSource());
    expect(values).toEqual({ liquidityTier: "instant", isIncluded: true, eligibleCapMinor: 0 });
  });

  it("prefills from an existing configuration, using 0 as the no-cap sentinel", () => {
    const source: ReserveSource = {
      ...unconfiguredSource(),
      configuration: {
        liquidityTier: "locked",
        isIncluded: false,
        eligibleCapMinor: 50_000,
        effectiveFrom: ASOF,
        configuredAt: ASOF
      }
    };
    const values = initialReserveSourceFormValues(source);
    expect(values).toEqual({
      liquidityTier: "locked",
      isIncluded: false,
      eligibleCapMinor: 50_000
    });
  });
});

describe("parseReserveSourceForm", () => {
  it("parses valid values without a cap", () => {
    const result = parseReserveSourceForm({
      liquidityTier: "instant",
      isIncluded: true,
      eligibleCapMinor: 0
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eligibleCapMinor).toBeUndefined();
    }
  });

  it("parses valid values with a positive cap", () => {
    const result = parseReserveSourceForm({
      liquidityTier: "t_plus_1",
      isIncluded: true,
      eligibleCapMinor: 250_000
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eligibleCapMinor).toBe(250_000);
    }
  });

  it("treats a positive cap at the schema's upper bound as valid", () => {
    const result = parseReserveSourceForm({
      liquidityTier: "instant",
      isIncluded: true,
      eligibleCapMinor: Number.MAX_SAFE_INTEGER
    });
    expect(result.ok).toBe(true);
  });
});

describe("previewEligibleMinor", () => {
  it("returns null when the current value is unavailable", () => {
    expect(previewEligibleMinor(null, 0)).toBeNull();
  });

  it("returns the current value when there is no cap", () => {
    expect(previewEligibleMinor(100_000, 0)).toBe(100_000);
  });

  it("caps the preview at the configured amount", () => {
    expect(previewEligibleMinor(500_000, 100_000)).toBe(100_000);
  });

  it("caps at the current value when the cap exceeds it", () => {
    expect(previewEligibleMinor(50_000, 999_999)).toBe(50_000);
  });

  it("floors a negative current value at zero", () => {
    expect(previewEligibleMinor(-10_000, 0)).toBe(0);
  });
});

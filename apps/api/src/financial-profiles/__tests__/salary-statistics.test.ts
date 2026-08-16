import type { FinancialProfile, SalaryVersion } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  SALARY_STATISTICS_FORMULA_VERSION,
  annualizedNetIncomeMinor,
  calculateSalaryStatistics,
  eightHourWorkdayEquivalentMinor,
  netHourlyWageMinor,
  scaleMinorAmount,
  selectEffectiveSalaryVersion,
  selectUpcomingSalaryVersion
} from "../salary-statistics.js";

const ASOF = new Date("2026-08-16T00:00:00.000Z");

function version(overrides: Partial<SalaryVersion> = {}): SalaryVersion {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-a",
    netMonthlySalaryMinor: 12_50_000,
    annualCtcMinor: null,
    effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
    source: "manually_confirmed",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides
  };
}

function profile(overrides: Partial<FinancialProfile> = {}): FinancialProfile {
  return {
    userId: "user-a",
    monthlyWorkMinutes: 9_600,
    salaryCreditDay: 1,
    expectedAnnualIncrementBps: null,
    incomeStability: "stable",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides
  };
}

describe("scaleMinorAmount", () => {
  it.each([
    [100, 1, 3, 33],
    [200, 1, 3, 67],
    [1, 1, 2, 1],
    [3, 1, 2, 2],
    [5, 1, 10, 1],
    [4, 1, 10, 0],
    [0, 12, 1, 0]
  ])("scales %d by %d/%d to %d (half rounds up)", (amount, multiplier, divisor, expected) => {
    expect(scaleMinorAmount(amount, multiplier, divisor)).toBe(expected);
  });

  it("keeps full precision across a large multiply-then-divide", () => {
    // 9e14 paise × 60 = 5.4e16 overflows a double's safe-integer range as an
    // intermediate product, but the bigint intermediate keeps the quotient exact.
    expect(900_000_000_000_000 * 60).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(scaleMinorAmount(900_000_000_000_000, 60, 9_600)).toBe(5_625_000_000_000);
  });

  it("rejects an amount whose scaled result leaves the safe-integer range", () => {
    expect(() => scaleMinorAmount(Number.MAX_SAFE_INTEGER, 12, 1)).toThrow(RangeError);
  });

  it.each([
    [-1, 12, 1],
    [1.5, 12, 1],
    [100, 0, 1],
    [100, -2, 1],
    [100, 12, 0],
    [100, 12, -1],
    [100, 12, 1.5]
  ])("rejects invalid inputs (%p, %p, %p)", (amount, multiplier, divisor) => {
    expect(() => scaleMinorAmount(amount, multiplier, divisor)).toThrow(RangeError);
  });
});

describe("derived salary figures", () => {
  it("annualizes net monthly salary by twelve", () => {
    expect(annualizedNetIncomeMinor(12_50_000)).toBe(1_50_00_000);
    expect(annualizedNetIncomeMinor(1)).toBe(12);
  });

  it("computes the hourly wage from 160 working hours", () => {
    // ₹12,500.00 / 160 h = ₹78.125 → 7_813 paise after rounding half up.
    expect(netHourlyWageMinor(12_50_000, 9_600)).toBe(7_813);
  });

  it("computes the eight-hour workday equivalent", () => {
    // ₹12,500.00 × 480 / 9600 = ₹625.00 exactly.
    expect(eightHourWorkdayEquivalentMinor(12_50_000, 9_600)).toBe(62_500);
  });

  it("rounds an exact half paisa upward rather than truncating", () => {
    // 1 paisa over 2 minutes of work: 1 × 60 / 2 = 30 paise per hour, exact.
    expect(netHourlyWageMinor(1, 2)).toBe(30);
    // 1 paisa over 120 minutes: 1 × 60 / 120 = 0.5 → 1.
    expect(netHourlyWageMinor(1, 120)).toBe(1);
    // 1 paisa over 121 minutes: below half → 0.
    expect(netHourlyWageMinor(1, 121)).toBe(0);
  });

  it("refuses a salary whose annualized value exceeds the safe-integer range", () => {
    expect(() => annualizedNetIncomeMinor(Number.MAX_SAFE_INTEGER - 1)).toThrow(RangeError);
  });

  it("handles a one-paisa salary at the smallest boundary", () => {
    expect(annualizedNetIncomeMinor(1)).toBe(12);
    expect(eightHourWorkdayEquivalentMinor(1, 44_640)).toBe(0);
  });
});

describe("selectEffectiveSalaryVersion", () => {
  const older = version({ id: "11111111-1111-4111-8111-111111111111" });
  const newer = version({
    id: "22222222-2222-4222-8222-222222222222",
    effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    netMonthlySalaryMinor: 14_00_000
  });
  const future = version({
    id: "33333333-3333-4333-8333-333333333333",
    effectiveFrom: new Date("2026-12-01T00:00:00.000Z"),
    netMonthlySalaryMinor: 16_00_000
  });

  it("picks the newest version already in effect", () => {
    expect(selectEffectiveSalaryVersion([older, newer, future], ASOF)?.id).toBe(newer.id);
  });

  it("excludes a future-dated version until it takes effect", () => {
    expect(selectEffectiveSalaryVersion([older, newer, future], ASOF)?.id).not.toBe(future.id);
    expect(
      selectEffectiveSalaryVersion([older, newer, future], new Date("2026-12-01T00:00:00.000Z"))?.id
    ).toBe(future.id);
  });

  it("treats a version effective at the exact asOf instant as in effect", () => {
    expect(selectEffectiveSalaryVersion([older], older.effectiveFrom)?.id).toBe(older.id);
  });

  it("returns null when every version is future dated", () => {
    expect(selectEffectiveSalaryVersion([future], ASOF)).toBeNull();
    expect(selectEffectiveSalaryVersion([], ASOF)).toBeNull();
  });

  it("breaks a same-instant tie by the highest id, deterministically", () => {
    const low = version({ id: "aaaaaaaa-1111-4111-8111-111111111111" });
    const high = version({ id: "bbbbbbbb-1111-4111-8111-111111111111" });
    expect(selectEffectiveSalaryVersion([low, high], ASOF)?.id).toBe(high.id);
    expect(selectEffectiveSalaryVersion([high, low], ASOF)?.id).toBe(high.id);
  });

  it("finds the earliest upcoming version, or null", () => {
    expect(selectUpcomingSalaryVersion([older, newer, future], ASOF)?.id).toBe(future.id);
    expect(selectUpcomingSalaryVersion([older, newer], ASOF)).toBeNull();
  });
});

describe("calculateSalaryStatistics", () => {
  it("returns a reproducible complete envelope for a stable income", () => {
    const statistics = calculateSalaryStatistics({
      profile: profile(),
      effectiveVersion: version(),
      upcomingVersion: null,
      asOf: ASOF,
      computedAt: new Date("2026-08-16T10:00:00.000Z")
    });

    expect(statistics).toMatchObject({
      currentNetMonthlySalaryMinor: 12_50_000,
      annualizedNetIncomeMinor: 1_50_00_000,
      netHourlyWageMinor: 7_813,
      eightHourWorkdayEquivalentMinor: 62_500,
      monthlyWorkMinutes: 9_600,
      salaryVersionId: "11111111-1111-4111-8111-111111111111",
      formulaVersion: SALARY_STATISTICS_FORMULA_VERSION,
      dataQuality: "complete",
      limitations: []
    });
    expect(statistics.assumptions).toEqual({
      monthsPerYear: 12,
      minutesPerHour: 60,
      standardWorkdayMinutes: 480,
      monthlyWorkMinutes: 9_600,
      incomeStability: "stable",
      expectedAnnualIncrementBps: null,
      rounding: "half_up"
    });
  });

  it("pins the formula version so a changed formula is a visible change", () => {
    expect(SALARY_STATISTICS_FORMULA_VERSION).toBe(1);
  });

  it("marks a variable income as limited and explains why", () => {
    const statistics = calculateSalaryStatistics({
      profile: profile({ incomeStability: "variable" }),
      effectiveVersion: version(),
      upcomingVersion: null,
      asOf: ASOF,
      computedAt: ASOF
    });
    expect(statistics.dataQuality).toBe("limited");
    expect(statistics.limitations[0]).toContain("variable");
  });

  it("marks a long-unchanged salary as stale", () => {
    const statistics = calculateSalaryStatistics({
      profile: profile(),
      effectiveVersion: version({ effectiveFrom: new Date("2023-01-01T00:00:00.000Z") }),
      upcomingVersion: null,
      asOf: ASOF,
      computedAt: ASOF
    });
    expect(statistics.dataQuality).toBe("stale");
    expect(statistics.limitations.join(" ")).toContain("18 months");
  });

  it("notes a future salary change without letting it change the figures", () => {
    const upcoming = version({
      id: "33333333-3333-4333-8333-333333333333",
      effectiveFrom: new Date("2026-12-01T00:00:00.000Z"),
      netMonthlySalaryMinor: 20_00_000
    });
    const statistics = calculateSalaryStatistics({
      profile: profile(),
      effectiveVersion: version(),
      upcomingVersion: upcoming,
      asOf: ASOF,
      computedAt: ASOF
    });
    expect(statistics.currentNetMonthlySalaryMinor).toBe(12_50_000);
    expect(statistics.limitations.join(" ")).toContain("2026-12-01T00:00:00.000Z");
  });

  it("never treats annual CTC as spendable income", () => {
    const statistics = calculateSalaryStatistics({
      profile: profile(),
      effectiveVersion: version({ annualCtcMinor: 5_00_00_000 }),
      upcomingVersion: null,
      asOf: ASOF,
      computedAt: ASOF
    });
    expect(statistics.annualizedNetIncomeMinor).toBe(1_50_00_000);
    expect(statistics.limitations.join(" ")).toContain("Annual CTC");
  });

  it("propagates the expected increment as a declared assumption only", () => {
    const statistics = calculateSalaryStatistics({
      profile: profile({ expectedAnnualIncrementBps: 900 }),
      effectiveVersion: version(),
      upcomingVersion: null,
      asOf: ASOF,
      computedAt: ASOF
    });
    expect(statistics.assumptions.expectedAnnualIncrementBps).toBe(900);
    expect(statistics.annualizedNetIncomeMinor).toBe(1_50_00_000);
  });

  it("throws rather than clamping a salary that cannot be annualized safely", () => {
    expect(() =>
      calculateSalaryStatistics({
        profile: profile(),
        effectiveVersion: version({ netMonthlySalaryMinor: Number.MAX_SAFE_INTEGER }),
        upcomingVersion: null,
        asOf: ASOF,
        computedAt: ASOF
      })
    ).toThrow(RangeError);
  });
});

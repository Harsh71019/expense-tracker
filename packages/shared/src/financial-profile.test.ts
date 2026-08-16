import { describe, expect, it } from "vitest";

import {
  CreateSalaryVersionSchema,
  FinancialProfileSchema,
  FinancialProfileStateSchema,
  FinancialProfileUpdateSchema,
  IncomeStabilitySchema,
  ListSalaryVersionsQuerySchema,
  MAX_ANNUAL_INCREMENT_BPS,
  MAX_MONTHLY_WORK_MINUTES,
  SUGGESTED_MONTHLY_WORK_MINUTES,
  SalaryStatisticsQuerySchema,
  SalaryStatisticsSchema,
  SalaryVersionPageSchema,
  SalaryVersionSchema,
  monthlyWorkHoursFromMinutes,
  monthlyWorkMinutesFromHours
} from "./financial-profile.js";

const VERSION_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("FinancialProfileUpdateSchema", () => {
  it("accepts the minimum required work facts and defaults the optional ones to null", () => {
    expect(
      FinancialProfileUpdateSchema.parse({
        monthlyWorkMinutes: SUGGESTED_MONTHLY_WORK_MINUTES,
        incomeStability: "stable"
      })
    ).toEqual({
      monthlyWorkMinutes: 9_600,
      incomeStability: "stable",
      salaryCreditDay: null,
      expectedAnnualIncrementBps: null
    });
  });

  it("keeps explicitly provided optional facts", () => {
    expect(
      FinancialProfileUpdateSchema.parse({
        monthlyWorkMinutes: 8_400,
        incomeStability: "variable",
        salaryCreditDay: 1,
        expectedAnnualIncrementBps: 850
      })
    ).toEqual({
      monthlyWorkMinutes: 8_400,
      incomeStability: "variable",
      salaryCreditDay: 1,
      expectedAnnualIncrementBps: 850
    });
  });

  it("rejects a missing required field", () => {
    expect(FinancialProfileUpdateSchema.safeParse({ monthlyWorkMinutes: 9_600 }).success).toBe(
      false
    );
    expect(FinancialProfileUpdateSchema.safeParse({ incomeStability: "stable" }).success).toBe(
      false
    );
  });

  it("rejects unknown extra keys", () => {
    expect(
      FinancialProfileUpdateSchema.safeParse({
        monthlyWorkMinutes: 9_600,
        incomeStability: "stable",
        netMonthlySalaryMinor: 100_000
      }).success
    ).toBe(false);
  });

  it.each([0, -1, MAX_MONTHLY_WORK_MINUTES + 1, 9_600.5, Number.NaN])(
    "rejects invalid monthly work minutes %p",
    (monthlyWorkMinutes) => {
      expect(
        FinancialProfileUpdateSchema.safeParse({ monthlyWorkMinutes, incomeStability: "stable" })
          .success
      ).toBe(false);
    }
  );

  it.each([0, 32, -3, 1.5])("rejects invalid salary credit day %p", (salaryCreditDay) => {
    expect(
      FinancialProfileUpdateSchema.safeParse({
        monthlyWorkMinutes: 9_600,
        incomeStability: "stable",
        salaryCreditDay
      }).success
    ).toBe(false);
  });

  it.each([-1, MAX_ANNUAL_INCREMENT_BPS + 1, 7.5])(
    "rejects invalid increment basis points %p",
    (expectedAnnualIncrementBps) => {
      expect(
        FinancialProfileUpdateSchema.safeParse({
          monthlyWorkMinutes: 9_600,
          incomeStability: "stable",
          expectedAnnualIncrementBps
        }).success
      ).toBe(false);
    }
  );

  it("rejects an unknown income stability", () => {
    expect(IncomeStabilitySchema.safeParse("chaotic").success).toBe(false);
    expect(IncomeStabilitySchema.parse("irregular")).toBe("irregular");
  });
});

describe("CreateSalaryVersionSchema", () => {
  it("accepts a required salary with an ISO effective date and no CTC", () => {
    expect(
      CreateSalaryVersionSchema.parse({
        netMonthlySalaryMinor: 12_50_000,
        effectiveFrom: "2026-04-01T00:00:00.000Z"
      })
    ).toEqual({
      netMonthlySalaryMinor: 12_50_000,
      annualCtcMinor: null,
      effectiveFrom: new Date("2026-04-01T00:00:00.000Z")
    });
  });

  it("accepts an optional annual CTC", () => {
    expect(
      CreateSalaryVersionSchema.parse({
        netMonthlySalaryMinor: 12_50_000,
        annualCtcMinor: 2_00_00_000,
        effectiveFrom: "2026-04-01T00:00:00.000Z"
      }).annualCtcMinor
    ).toBe(2_00_00_000);
  });

  it.each([0, -1, 1.5])("rejects a zero or negative salary %p", (netMonthlySalaryMinor) => {
    expect(
      CreateSalaryVersionSchema.safeParse({
        netMonthlySalaryMinor,
        effectiveFrom: "2026-04-01T00:00:00.000Z"
      }).success
    ).toBe(false);
  });

  it("rejects a salary beyond the safe-integer paise range", () => {
    expect(
      CreateSalaryVersionSchema.safeParse({
        netMonthlySalaryMinor: Number.MAX_SAFE_INTEGER + 2,
        effectiveFrom: "2026-04-01T00:00:00.000Z"
      }).success
    ).toBe(false);
  });

  it("rejects a missing effective date", () => {
    expect(CreateSalaryVersionSchema.safeParse({ netMonthlySalaryMinor: 12_50_000 }).success).toBe(
      false
    );
  });

  it("rejects unknown extra keys", () => {
    expect(
      CreateSalaryVersionSchema.safeParse({
        netMonthlySalaryMinor: 12_50_000,
        effectiveFrom: "2026-04-01T00:00:00.000Z",
        source: "manually_confirmed"
      }).success
    ).toBe(false);
  });
});

describe("SalaryVersionSchema and page", () => {
  it("coerces stored dates and allows a null CTC", () => {
    const version = SalaryVersionSchema.parse({
      id: VERSION_ID,
      userId: "user-a",
      netMonthlySalaryMinor: 12_50_000,
      annualCtcMinor: null,
      effectiveFrom: "2026-04-01T00:00:00.000Z",
      source: "manually_confirmed",
      createdAt: "2026-04-01T05:00:00.000Z"
    });
    expect(version.effectiveFrom).toBeInstanceOf(Date);
    expect(version.annualCtcMinor).toBeNull();
  });

  it("rejects an unknown salary source", () => {
    expect(
      SalaryVersionSchema.safeParse({
        id: VERSION_ID,
        userId: "user-a",
        netMonthlySalaryMinor: 1,
        annualCtcMinor: null,
        effectiveFrom: "2026-04-01T00:00:00.000Z",
        source: "detected",
        createdAt: "2026-04-01T00:00:00.000Z"
      }).success
    ).toBe(false);
  });

  it("describes a cursor page", () => {
    expect(
      SalaryVersionPageSchema.parse({
        items: [],
        pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
      }).pageInfo.limit
    ).toBe(50);
  });

  it("defaults and bounds the history query", () => {
    expect(ListSalaryVersionsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(ListSalaryVersionsQuerySchema.parse({ limit: "10" }).limit).toBe(10);
    expect(ListSalaryVersionsQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
    expect(ListSalaryVersionsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("keeps asOf optional on the statistics query", () => {
    expect(SalaryStatisticsQuerySchema.parse({}).asOf).toBeUndefined();
    expect(SalaryStatisticsQuerySchema.parse({ asOf: "2026-05-01T00:00:00.000Z" }).asOf).toEqual(
      new Date("2026-05-01T00:00:00.000Z")
    );
    expect(SalaryStatisticsQuerySchema.safeParse({ asOf: "not-a-date" }).success).toBe(false);
  });
});

describe("FinancialProfileSchema and state", () => {
  it("accepts null optional facts", () => {
    expect(
      FinancialProfileSchema.parse({
        userId: "user-a",
        monthlyWorkMinutes: 9_600,
        salaryCreditDay: null,
        expectedAnnualIncrementBps: null,
        incomeStability: "stable",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z"
      }).salaryCreditDay
    ).toBeNull();
  });

  it("models the unconfigured setup state without fabricating a profile", () => {
    const state = FinancialProfileStateSchema.parse({
      configured: false,
      profile: null,
      currentSalaryVersion: null,
      upcomingSalaryVersion: null,
      suggestedMonthlyWorkMinutes: SUGGESTED_MONTHLY_WORK_MINUTES,
      asOf: "2026-05-01T00:00:00.000Z"
    });
    expect(state.configured).toBe(false);
    expect(state.suggestedMonthlyWorkMinutes).toBe(9_600);
  });
});

describe("SalaryStatisticsSchema", () => {
  const statistics = {
    currentNetMonthlySalaryMinor: 12_50_000,
    annualizedNetIncomeMinor: 1_50_00_000,
    netHourlyWageMinor: 7_812,
    eightHourWorkdayEquivalentMinor: 62_500,
    effectiveFrom: "2026-04-01T00:00:00.000Z",
    monthlyWorkMinutes: 9_600,
    salaryVersionId: VERSION_ID,
    computedAt: "2026-05-01T00:00:00.000Z",
    formulaVersion: 1,
    dataQuality: "complete",
    assumptions: {
      monthsPerYear: 12,
      minutesPerHour: 60,
      standardWorkdayMinutes: 480,
      monthlyWorkMinutes: 9_600,
      incomeStability: "stable",
      expectedAnnualIncrementBps: null,
      rounding: "half_up"
    },
    limitations: []
  };

  it("parses a complete statistics envelope", () => {
    expect(SalaryStatisticsSchema.parse(statistics).formulaVersion).toBe(1);
  });

  it("rejects a non-integer derived value", () => {
    expect(
      SalaryStatisticsSchema.safeParse({ ...statistics, netHourlyWageMinor: 7_812.5 }).success
    ).toBe(false);
  });

  it("rejects an unknown data-quality state", () => {
    expect(SalaryStatisticsSchema.safeParse({ ...statistics, dataQuality: "great" }).success).toBe(
      false
    );
  });
});

describe("work-hour conversion", () => {
  it("converts the suggested 160 hours to canonical minutes and back", () => {
    expect(monthlyWorkMinutesFromHours(160)).toBe(9_600);
    expect(monthlyWorkHoursFromMinutes(9_600)).toBe(160);
  });

  it("converts half hours exactly", () => {
    expect(monthlyWorkMinutesFromHours(162.5)).toBe(9_750);
    expect(monthlyWorkHoursFromMinutes(9_750)).toBe(162.5);
  });

  it.each([0, -1, 745, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects out-of-range hours %p",
    (hours) => {
      expect(() => monthlyWorkMinutesFromHours(hours)).toThrow();
    }
  );

  it("rejects hours that do not resolve to whole minutes", () => {
    expect(() => monthlyWorkMinutesFromHours(160.001)).toThrow(RangeError);
  });
});

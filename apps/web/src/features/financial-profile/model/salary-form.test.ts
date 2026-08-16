import type { FinancialProfile } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  INCOME_STABILITY_OPTIONS,
  calendarDateToIso,
  formatBpsAsPercent,
  initialWorkProfileValues,
  isoToCalendarDate,
  parseSalaryForm,
  parseWorkProfileForm,
  percentToBps
} from "./salary-form";

const PROFILE: FinancialProfile = {
  userId: "user-a",
  monthlyWorkMinutes: 8_400,
  salaryCreditDay: 5,
  expectedAnnualIncrementBps: 850,
  incomeStability: "variable",
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z")
};

describe("initialWorkProfileValues", () => {
  it("suggests 160 hours for a user with no profile yet, without assuming anything else", () => {
    expect(initialWorkProfileValues(null)).toEqual({
      monthlyWorkHours: "160",
      incomeStability: "stable",
      salaryCreditDay: "",
      expectedAnnualIncrementPercent: ""
    });
  });

  it("shows the saved profile in the units the user typed", () => {
    expect(initialWorkProfileValues(PROFILE)).toEqual({
      monthlyWorkHours: "140",
      incomeStability: "variable",
      salaryCreditDay: "5",
      expectedAnnualIncrementPercent: "8.5"
    });
  });

  it("offers exactly the three income-stability choices", () => {
    expect(INCOME_STABILITY_OPTIONS.map((option) => option.value)).toEqual([
      "stable",
      "variable",
      "irregular"
    ]);
  });
});

describe("percentToBps and formatBpsAsPercent", () => {
  it.each([
    ["0", 0],
    ["8", 800],
    ["8.5", 850],
    ["8.55", 855],
    ["100", 10_000]
  ])("converts %s%% to %d bps", (input, expected) => {
    expect(percentToBps(input)).toBe(expected);
  });

  it.each(["", "-1", "8.555", "eight", "8%"])("rejects %p", (input) => {
    expect(() => percentToBps(input)).toThrow(RangeError);
  });

  it("round-trips through display formatting", () => {
    expect(formatBpsAsPercent(850)).toBe("8.5");
    expect(formatBpsAsPercent(855)).toBe("8.55");
    expect(formatBpsAsPercent(800)).toBe("8");
    expect(percentToBps(formatBpsAsPercent(855))).toBe(855);
  });
});

describe("parseWorkProfileForm", () => {
  const base = {
    monthlyWorkHours: "160",
    incomeStability: "stable",
    salaryCreditDay: "",
    expectedAnnualIncrementPercent: ""
  } as const;

  it("converts the confirmed hours into canonical minutes and nulls the optional facts", () => {
    const result = parseWorkProfileForm(base);
    expect(result).toEqual({
      ok: true,
      value: {
        monthlyWorkMinutes: 9_600,
        incomeStability: "stable",
        salaryCreditDay: null,
        expectedAnnualIncrementBps: null
      }
    });
  });

  it("keeps the suggested hours editable and converts a changed value", () => {
    expect(parseWorkProfileForm({ ...base, monthlyWorkHours: "182.5" })).toMatchObject({
      ok: true,
      value: { monthlyWorkMinutes: 10_950 }
    });
  });

  it("converts optional credit day and increment", () => {
    expect(
      parseWorkProfileForm({
        ...base,
        salaryCreditDay: "1",
        expectedAnnualIncrementPercent: "8.5"
      })
    ).toMatchObject({
      ok: true,
      value: { salaryCreditDay: 1, expectedAnnualIncrementBps: 850 }
    });
  });

  it.each([
    ["", "salary-work-hours"],
    ["0", "salary-work-hours"],
    ["abc", "salary-work-hours"],
    ["745", "salary-work-hours"]
  ])("rejects invalid working hours %p and points at %s", (monthlyWorkHours, fieldId) => {
    const result = parseWorkProfileForm({ ...base, monthlyWorkHours });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a validation failure");
    expect(result.firstFieldId).toBe(fieldId);
    expect(result.errors[fieldId]).toBeDefined();
  });

  it.each(["0", "32", "1.5", "x"])("rejects an invalid salary credit day %p", (salaryCreditDay) => {
    const result = parseWorkProfileForm({ ...base, salaryCreditDay });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a validation failure");
    expect(result.firstFieldId).toBe("salary-credit-day");
  });

  it("rejects an increment that is not a percentage", () => {
    const result = parseWorkProfileForm({ ...base, expectedAnnualIncrementPercent: "eight" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a validation failure");
    expect(result.firstFieldId).toBe("salary-increment");
  });

  it("reports the first offending field when several are wrong", () => {
    const result = parseWorkProfileForm({
      ...base,
      monthlyWorkHours: "",
      salaryCreditDay: "1.5"
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a validation failure");
    expect(result.firstFieldId).toBe("salary-work-hours");
    expect(Object.keys(result.errors)).toHaveLength(2);
  });
});

describe("parseSalaryForm", () => {
  const base = {
    netMonthlySalaryMinor: 12_50_000,
    annualCtcMinor: 0,
    effectiveFrom: "2026-04-01"
  };

  it("serializes paise and the calendar date without an optional CTC", () => {
    expect(parseSalaryForm(base)).toEqual({
      ok: true,
      value: {
        netMonthlySalaryMinor: 12_50_000,
        annualCtcMinor: null,
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z")
      }
    });
  });

  it("includes an annual CTC when the user entered one", () => {
    expect(parseSalaryForm({ ...base, annualCtcMinor: 2_40_00_000 })).toMatchObject({
      ok: true,
      value: { annualCtcMinor: 2_40_00_000 }
    });
  });

  it("rejects a zero salary and focuses the salary field", () => {
    const result = parseSalaryForm({ ...base, netMonthlySalaryMinor: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a validation failure");
    expect(result.firstFieldId).toBe("salary-net-monthly");
    expect(result.errors["salary-net-monthly"]).toContain("net monthly in-hand salary");
  });

  it("rejects a missing effective date", () => {
    const result = parseSalaryForm({ ...base, effectiveFrom: "" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a validation failure");
    expect(result.firstFieldId).toBe("salary-effective-from");
  });

  it("rejects a salary beyond the safe-integer paise range", () => {
    const result = parseSalaryForm({
      ...base,
      netMonthlySalaryMinor: Number.MAX_SAFE_INTEGER + 2
    });
    expect(result.ok).toBe(false);
  });
});

describe("calendar date conversion", () => {
  it("sends a calendar day as that day's UTC midnight", () => {
    expect(calendarDateToIso("2026-04-01")).toBe("2026-04-01T00:00:00.000Z");
  });

  it("rejects anything that is not a YYYY-MM-DD calendar date", () => {
    expect(() => calendarDateToIso("01/04/2026")).toThrow(RangeError);
  });

  it("renders an instant back as a picker-ready calendar day", () => {
    expect(isoToCalendarDate(new Date("2026-04-01T18:30:00.000Z"))).toBe("2026-04-01");
  });
});

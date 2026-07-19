import { describe, expect, it } from "vitest";

import {
  currentMonthInIndia,
  defaultReportMonth,
  isMonthKey,
  monthLabel,
  recentMonths,
  reportMonthFromParam,
  shiftMonth
} from "./month";

describe("shiftMonth", () => {
  it("moves forward and backward within a year", () => {
    expect(shiftMonth("2026-06", 1)).toBe("2026-07");
    expect(shiftMonth("2026-06", -1)).toBe("2026-05");
  });

  it("rolls over a year boundary in both directions", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("is a no-op for a zero shift", () => {
    expect(shiftMonth("2026-06", 0)).toBe("2026-06");
  });
});

describe("recentMonths", () => {
  it("returns count months ending at the given month, oldest first", () => {
    expect(recentMonths("2026-03", 4)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03"]);
  });

  it("returns a single-element array for count 1", () => {
    expect(recentMonths("2026-03", 1)).toEqual(["2026-03"]);
  });
});

describe("defaultReportMonth", () => {
  it("is exactly one month before the current month", () => {
    expect(defaultReportMonth()).toBe(shiftMonth(currentMonthInIndia(), -1));
  });
});

describe("reportMonthFromParam", () => {
  it("accepts a valid bookmarkable month", () => {
    expect(isMonthKey("2026-06")).toBe(true);
    expect(reportMonthFromParam("2026-06")).toBe("2026-06");
    expect(reportMonthFromParam(["2026-05", "2026-04"])).toBe("2026-05");
  });

  it("falls back for missing or invalid months", () => {
    expect(isMonthKey("2026-13")).toBe(false);
    expect(reportMonthFromParam("2026-13")).toBe(defaultReportMonth());
    expect(reportMonthFromParam(undefined)).toBe(defaultReportMonth());
  });
});

describe("monthLabel", () => {
  it("formats the long form as month name and full year", () => {
    expect(monthLabel("2026-06", "long")).toBe("June 2026");
  });

  it("formats the short form as abbreviated month and two-digit year", () => {
    expect(monthLabel("2026-06", "short")).toBe("Jun 26");
  });
});

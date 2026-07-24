import { describe, expect, it } from "vitest";

import {
  chunk,
  deltaPct,
  endOfISTDay,
  istMonthEndInstant,
  listISTDayKeys,
  monthWindow,
  savingsRatePct,
  startOfISTDay
} from "../dashboard-date.js";

describe("monthWindow", () => {
  it("returns the requested count of months, oldest first, ending at endMonth", () => {
    expect(monthWindow("2026-03", 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("rolls back across a year boundary", () => {
    expect(monthWindow("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("returns just the end month when count is 1", () => {
    expect(monthWindow("2026-08", 1)).toEqual(["2026-08"]);
  });
});

describe("startOfISTDay / endOfISTDay", () => {
  it("startOfISTDay maps a UTC-morning instant to IST midnight of the same IST calendar day", () => {
    // 2026-08-15T09:00:00Z is 2026-08-15T14:30 IST -- IST midnight of that day is 2026-08-14T18:30:00Z.
    const start = startOfISTDay(new Date("2026-08-15T09:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-08-14T18:30:00.000Z");
  });

  it("startOfISTDay maps an instant just after IST midnight to the same day's start", () => {
    // 2026-08-01T00:30 IST = 2026-07-31T19:00:00Z.
    const start = startOfISTDay(new Date("2026-07-31T19:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });

  it("endOfISTDay is exactly 1ms before the next IST day starts", () => {
    const date = new Date("2026-08-15T09:00:00.000Z");
    const end = endOfISTDay(date);
    const nextDayStart = startOfISTDay(new Date(end.getTime() + 1));
    expect(nextDayStart.getTime()).toBe(end.getTime() + 1);
    expect(end.getTime()).toBeGreaterThan(startOfISTDay(date).getTime());
  });
});

describe("istMonthEndInstant", () => {
  it("returns the last instant of the month in IST", () => {
    const end = istMonthEndInstant("2026-08");
    // IST midnight of 2026-09-01 is 2026-08-31T18:30:00Z; the month-end instant is 1ms before that.
    expect(end.toISOString()).toBe("2026-08-31T18:29:59.999Z");
  });

  it("rolls across a year boundary", () => {
    const end = istMonthEndInstant("2025-12");
    expect(end.toISOString()).toBe("2025-12-31T18:29:59.999Z");
  });
});

describe("listISTDayKeys", () => {
  it("lists every IST calendar day from from to to, inclusive", () => {
    const keys = listISTDayKeys(
      new Date("2026-08-01T09:00:00.000Z"),
      new Date("2026-08-03T09:00:00.000Z")
    );
    expect(keys).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });

  it("returns a single key when from and to fall on the same IST day", () => {
    const keys = listISTDayKeys(
      new Date("2026-08-01T01:00:00.000Z"),
      new Date("2026-08-01T15:00:00.000Z")
    );
    expect(keys).toEqual(["2026-08-01"]);
  });
});

describe("deltaPct", () => {
  it("computes a positive percentage increase", () => {
    expect(deltaPct(150, 100)).toBe(50);
  });

  it("computes a negative percentage decrease", () => {
    expect(deltaPct(50, 100)).toBe(-50);
  });

  it("returns null when the previous value is 0, rather than dividing by zero", () => {
    expect(deltaPct(100, 0)).toBeNull();
  });

  it("uses the previous value's magnitude as the denominator when it's negative", () => {
    expect(deltaPct(-50, -100)).toBe(50);
  });
});

describe("savingsRatePct", () => {
  it("computes the percentage of income not spent", () => {
    expect(savingsRatePct(1000, 700)).toBe(30);
  });

  it("returns 0 when there is no income, rather than a nonsensical rate", () => {
    expect(savingsRatePct(0, 500)).toBe(0);
  });

  it("can be negative when expenses exceed income", () => {
    expect(savingsRatePct(1000, 1500)).toBe(-50);
  });
});

describe("chunk", () => {
  it("splits an array into fixed-size chunks", () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it("returns an empty array for an empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

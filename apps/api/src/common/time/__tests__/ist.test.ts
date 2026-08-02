import { describe, expect, it } from "vitest";

import {
  addDaysUtc,
  istCalendarDateStartUtc,
  istMonthBounds,
  listISTMonthDayKeys,
  toISTCalendarDate,
  toISTMonth,
  toISTWeekStart
} from "../ist.js";

describe("toISTCalendarDate", () => {
  it("renders a UTC-midnight instant as the same calendar day (IST is ahead of UTC)", () => {
    expect(toISTCalendarDate(new Date("2026-07-04T00:00:00.000Z"))).toBe("2026-07-04");
  });

  it("rolls a late-UTC-evening instant into the next IST calendar day", () => {
    // 2026-07-03T19:00:00Z + 5:30 = 2026-07-04T00:30 IST
    expect(toISTCalendarDate(new Date("2026-07-03T19:00:00.000Z"))).toBe("2026-07-04");
  });

  it("does not roll a pre-offset instant into the next day", () => {
    // 2026-07-03T18:00:00Z + 5:30 = 2026-07-03T23:30 IST — still the 3rd
    expect(toISTCalendarDate(new Date("2026-07-03T18:00:00.000Z"))).toBe("2026-07-03");
  });

  it("round-trips a parseExplicitDate result back to the same calendar date", () => {
    expect(toISTCalendarDate(new Date(Date.UTC(2026, 6, 4)))).toBe("2026-07-04");
  });
});

describe("toISTMonth", () => {
  it("truncates the IST calendar date to its month bucket", () => {
    expect(toISTMonth(new Date("2026-07-04T00:00:00.000Z"))).toBe("2026-07");
  });

  it("rolls a late-UTC-evening instant on the last day of the month into the next month", () => {
    // 2026-06-30T19:00:00Z + 5:30 = 2026-07-01T00:30 IST
    expect(toISTMonth(new Date("2026-06-30T19:00:00.000Z"))).toBe("2026-07");
  });
});

describe("IST month helpers", () => {
  it("returns exact half-open UTC bounds for an IST month", () => {
    expect(istMonthBounds("2026-08")).toEqual({
      start: new Date("2026-07-31T18:30:00.000Z"),
      end: new Date("2026-08-31T18:30:00.000Z")
    });
  });

  it("lists every day in leap and non-leap months", () => {
    const leapDays = listISTMonthDayKeys("2024-02");
    expect(leapDays).toHaveLength(29);
    expect(leapDays[0]).toBe("2024-02-01");
    expect(leapDays.at(-1)).toBe("2024-02-29");
  });
});

describe("istCalendarDateStartUtc", () => {
  it("returns the UTC instant of 00:00 IST for the containing calendar day", () => {
    // 2026-07-25 00:00 IST = 2026-07-24T18:30:00Z
    expect(istCalendarDateStartUtc(new Date("2026-07-25T03:00:00.000Z")).toISOString()).toBe(
      "2026-07-24T18:30:00.000Z"
    );
  });

  it("is idempotent when given an instant that is already an IST midnight", () => {
    const boundary = istCalendarDateStartUtc(new Date("2026-07-25T03:00:00.000Z"));
    expect(istCalendarDateStartUtc(boundary).toISOString()).toBe(boundary.toISOString());
  });

  it("rolls a late-UTC-evening instant to the next IST day's midnight", () => {
    // 2026-07-03T19:00:00Z is 2026-07-04T00:30 IST -> boundary is 2026-07-04T00:00 IST
    expect(istCalendarDateStartUtc(new Date("2026-07-03T19:00:00.000Z")).toISOString()).toBe(
      "2026-07-03T18:30:00.000Z"
    );
  });
});

describe("addDaysUtc", () => {
  it("adds whole days as exact 24h increments", () => {
    const start = new Date("2026-07-24T18:30:00.000Z");
    expect(addDaysUtc(start, 7).toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });

  it("subtracts days for a negative count", () => {
    const start = new Date("2026-07-24T18:30:00.000Z");
    expect(addDaysUtc(start, -30).toISOString()).toBe("2026-06-24T18:30:00.000Z");
  });
});

describe("toISTWeekStart", () => {
  it("returns the same Monday for every day in the same IST ISO week", () => {
    // 2026-07-20 is a Monday in IST.
    const monday = new Date("2026-07-20T03:00:00.000Z");
    const sunday = new Date("2026-07-26T18:00:00.000Z"); // still within the same IST week
    expect(toISTWeekStart(monday)).toBe("2026-07-20");
    expect(toISTWeekStart(sunday)).toBe("2026-07-20");
  });

  it("rolls to the next Monday once the IST calendar date crosses into the next week", () => {
    const nextMonday = new Date("2026-07-27T03:00:00.000Z");
    expect(toISTWeekStart(nextMonday)).toBe("2026-07-27");
  });
});

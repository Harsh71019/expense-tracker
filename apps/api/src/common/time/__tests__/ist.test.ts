import { describe, expect, it } from "vitest";

import { toISTCalendarDate, toISTMonth } from "../ist.js";

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

import { describe, expect, it } from "vitest";

import {
  calendarDayDistance,
  computeCreditCardCycle,
  computeNextCreditCardStatementAt
} from "./credit-card-cycle.js";

describe("computeNextCreditCardStatementAt", () => {
  it("uses the current month when the statement day has not passed in IST", () => {
    expect(
      computeNextCreditCardStatementAt(25, new Date("2026-07-20T20:00:00.000Z")).toISOString()
    ).toBe("2026-07-25T00:00:00.000Z");
  });

  it("moves to the next month after the statement day", () => {
    expect(
      computeNextCreditCardStatementAt(5, new Date("2026-07-05T20:00:00.000Z")).toISOString()
    ).toBe("2026-08-05T00:00:00.000Z");
  });

  it("clamps day 31 to the last day of February", () => {
    expect(
      computeNextCreditCardStatementAt(31, new Date("2027-02-01T00:00:00.000Z")).toISOString()
    ).toBe("2027-02-28T00:00:00.000Z");
  });
});

describe("computeCreditCardCycle", () => {
  it("computes the previous statement boundary and next-month due date", () => {
    const cycle = computeCreditCardCycle(25, 15, new Date("2026-07-25T00:00:00.000Z"));
    expect(cycle.cycleStart.toISOString()).toBe("2026-06-26T00:00:00.000Z");
    expect(cycle.cycleEnd.toISOString()).toBe("2026-07-25T00:00:00.000Z");
    expect(cycle.dueDate.toISOString()).toBe("2026-08-15T00:00:00.000Z");
    expect(cycle.nextStatementAt.toISOString()).toBe("2026-08-25T00:00:00.000Z");
  });

  it("uses a later due day in the same month", () => {
    const cycle = computeCreditCardCycle(5, 25, new Date("2026-07-05T00:00:00.000Z"));
    expect(cycle.dueDate.toISOString()).toBe("2026-07-25T00:00:00.000Z");
  });

  it("clamps statement and due days across leap February", () => {
    const cycle = computeCreditCardCycle(31, 31, new Date("2028-02-29T00:00:00.000Z"));
    expect(cycle.cycleStart.toISOString()).toBe("2028-02-01T00:00:00.000Z");
    expect(cycle.dueDate.toISOString()).toBe("2028-03-31T00:00:00.000Z");
    expect(cycle.nextStatementAt.toISOString()).toBe("2028-03-31T00:00:00.000Z");
  });

  it("rejects a date that is not the configured statement date", () => {
    expect(() => computeCreditCardCycle(25, 15, new Date("2026-07-24T00:00:00.000Z"))).toThrow(
      RangeError
    );
  });
});

describe("calendarDayDistance", () => {
  it("compares Asia/Kolkata calendar days rather than UTC dates", () => {
    expect(
      calendarDayDistance(
        new Date("2026-07-24T19:00:00.000Z"),
        new Date("2026-07-25T18:29:59.000Z")
      )
    ).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import {
  computeFirstOccurrence,
  computeNextOccurrence,
  CreateRecurringRuleSchema,
  RRuleStringSchema,
  UpdateRecurringRuleSchema
} from "./recurring.js";

const VALID_TEMPLATE = {
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  type: "expense",
  amountMinor: 150_000,
  description: "Rent"
};

describe("RRuleStringSchema", () => {
  it("accepts a well-formed monthly rrule", () => {
    expect(RRuleStringSchema.parse("FREQ=MONTHLY;BYMONTHDAY=1")).toBe("FREQ=MONTHLY;BYMONTHDAY=1");
  });

  it("rejects an empty string", () => {
    expect(() => RRuleStringSchema.parse("")).toThrow();
  });

  it("rejects an unparseable rrule", () => {
    expect(() => RRuleStringSchema.parse("not a valid rrule")).toThrow();
  });

  it("rejects an invalid FREQ value", () => {
    expect(() => RRuleStringSchema.parse("FREQ=FORTNIGHTLY")).toThrow();
  });

  it("rejects an embedded DTSTART", () => {
    expect(() => RRuleStringSchema.parse("DTSTART:20260101T000000Z\nFREQ=DAILY")).toThrow();
  });
});

describe("CreateRecurringRuleSchema", () => {
  it("accepts a well-formed monthly rule", () => {
    const parsed = CreateRecurringRuleSchema.parse({
      template: VALID_TEMPLATE,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      startAt: "2026-08-01T00:00:00.000Z"
    });
    expect(parsed.template.tags).toEqual([]);
  });

  it("rejects a non-positive amountMinor", () => {
    expect(() =>
      CreateRecurringRuleSchema.parse({
        template: { ...VALID_TEMPLATE, amountMinor: 0 },
        rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
        startAt: "2026-08-01T00:00:00.000Z"
      })
    ).toThrow();
  });
});

describe("UpdateRecurringRuleSchema", () => {
  it("rejects an empty patch", () => {
    expect(() => UpdateRecurringRuleSchema.parse({})).toThrow();
  });

  it("accepts a template patch that omits tags without defaulting it to []", () => {
    const parsed = UpdateRecurringRuleSchema.parse({ template: { amountMinor: 200_000 } });
    expect(parsed.template).toEqual({ amountMinor: 200_000 });
    expect(parsed.template?.tags).toBeUndefined();
  });

  it("accepts an isPaused-only patch", () => {
    expect(UpdateRecurringRuleSchema.parse({ isPaused: true })).toEqual({ isPaused: true });
  });
});

describe("computeFirstOccurrence", () => {
  it("returns startAt itself when it already satisfies the rrule", () => {
    const startAt = new Date(Date.UTC(2026, 7, 1));
    const first = computeFirstOccurrence("FREQ=MONTHLY;BYMONTHDAY=1", startAt);
    expect(first?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("returns the first occurrence after startAt when startAt itself doesn't match", () => {
    const startAt = new Date(Date.UTC(2026, 7, 15));
    const first = computeFirstOccurrence("FREQ=MONTHLY;BYMONTHDAY=1", startAt);
    expect(first?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("returns null for an UNTIL before startAt", () => {
    const startAt = new Date(Date.UTC(2026, 7, 1));
    const first = computeFirstOccurrence(
      "FREQ=MONTHLY;BYMONTHDAY=1;UNTIL=20260101T000000Z",
      startAt
    );
    expect(first).toBeNull();
  });
});

describe("computeNextOccurrence", () => {
  it("advances a monthly BYMONTHDAY rule to the next month", () => {
    const startAt = new Date(Date.UTC(2026, 7, 1));
    const next = computeNextOccurrence("FREQ=MONTHLY;BYMONTHDAY=1", startAt, startAt);
    expect(next?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("skips months without the target day-of-month (BYMONTHDAY=31)", () => {
    const startAt = new Date(Date.UTC(2026, 0, 31));
    const next = computeNextOccurrence("FREQ=MONTHLY;BYMONTHDAY=31", startAt, startAt);
    // February and April have no 31st — next real occurrence is March 31.
    expect(next?.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("returns null once a COUNT-limited rule is exhausted", () => {
    const startAt = new Date(Date.UTC(2026, 7, 1));
    const last = computeNextOccurrence("FREQ=MONTHLY;BYMONTHDAY=1;COUNT=2", startAt, startAt);
    expect(last?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    const exhausted = computeNextOccurrence(
      "FREQ=MONTHLY;BYMONTHDAY=1;COUNT=2",
      startAt,
      new Date(Date.UTC(2026, 8, 1))
    );
    expect(exhausted).toBeNull();
  });
});

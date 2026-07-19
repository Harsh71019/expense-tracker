import { describe, expect, it } from "vitest";

import { buildSchedule, parseSchedule, type ScheduleDraft } from "./schedule";

const base: ScheduleDraft = {
  startDate: "2026-07-19",
  frequency: "monthly",
  interval: 1,
  weekdays: [],
  monthDays: [1],
  yearMonth: 1,
  ending: "never",
  untilDate: "",
  count: 1
};

describe("recurring schedule model", () => {
  it("builds and parses a monthly RRULE", () => {
    const built = buildSchedule({ ...base, interval: 2, monthDays: [15, 1] });
    expect(built).toEqual({
      success: true,
      rrule: "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1,15",
      summary: "Every 2 months on day 1, 15"
    });
    expect(
      parseSchedule("FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1,15", new Date("2026-07-19"))
    ).toMatchObject({
      frequency: "monthly",
      interval: 2,
      monthDays: [1, 15]
    });
  });

  it("builds weekly and finite schedules", () => {
    expect(
      buildSchedule({
        ...base,
        frequency: "weekly",
        weekdays: ["MO", "FR"],
        ending: "count",
        count: 8
      })
    ).toMatchObject({ rrule: "FREQ=WEEKLY;BYDAY=MO,FR;COUNT=8" });
  });

  it("rejects incomplete and contradictory schedule choices", () => {
    expect(buildSchedule({ ...base, frequency: "weekly", weekdays: [] })).toMatchObject({
      success: false
    });
    expect(buildSchedule({ ...base, monthDays: [] })).toMatchObject({ success: false });
    expect(buildSchedule({ ...base, ending: "until", untilDate: "2026-07-18" })).toMatchObject({
      success: false
    });
  });

  it("returns null for unsupported RRULE fields", () => {
    expect(parseSchedule("FREQ=MONTHLY;BYSETPOS=1", new Date("2026-07-19"))).toBeNull();
    expect(parseSchedule("FREQ=DAILY;BYDAY=MO", new Date("2026-07-19"))).toBeNull();
    expect(parseSchedule("FREQ=YEARLY", new Date("2026-07-19"))).toBeNull();
  });
});

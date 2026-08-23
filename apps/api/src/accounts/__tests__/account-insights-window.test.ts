import { describe, expect, it } from "vitest";

import { buildAccountInsightsWindow } from "../account-insights-window.js";

describe("buildAccountInsightsWindow", () => {
  const now = new Date("2026-08-23T12:00:00.000Z");
  const createdAt = new Date("2024-03-12T08:00:00.000Z");

  it("builds 30 and 90 complete IST day buckets ending today", () => {
    const thirtyDays = buildAccountInsightsWindow("30d", createdAt, now);
    const ninetyDays = buildAccountInsightsWindow("90d", createdAt, now);

    expect(thirtyDays.bucket).toBe("day");
    expect(thirtyDays.periods).toHaveLength(30);
    expect(thirtyDays.periods[0]).toBe("2026-07-25");
    expect(thirtyDays.periods.at(-1)).toBe("2026-08-23");
    expect(ninetyDays.periods).toHaveLength(90);
  });

  it("builds a 12-month year window and an account-lifetime window", () => {
    const year = buildAccountInsightsWindow("1y", createdAt, now);
    const all = buildAccountInsightsWindow("all", createdAt, now);

    expect(year.bucket).toBe("month");
    expect(year.periods).toHaveLength(12);
    expect(year.periods[0]).toBe("2025-09-01");
    expect(year.periods.at(-1)).toBe("2026-08-01");
    expect(all.periods[0]).toBe("2024-03-01");
    expect(all.periods.at(-1)).toBe("2026-08-01");
  });
});

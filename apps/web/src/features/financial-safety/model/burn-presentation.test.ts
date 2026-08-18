import { describe, expect, it } from "vitest";

import {
  formatMonthLabel,
  getObservedMonthsWording,
  getQualityBadgeConfig,
  hasClassificationLimitations
} from "./burn-presentation.js";

describe("burn-presentation helpers", () => {
  it("formats YYYY-MM into friendly month string in Asia/Kolkata", () => {
    expect(formatMonthLabel("2026-05")).toBe("May 2026");
    expect(formatMonthLabel("2026-08")).toBe("Aug 2026");
    expect(formatMonthLabel("2026-12")).toBe("Dec 2026");
    expect(formatMonthLabel("invalid")).toBe("invalid");
  });

  it("produces correct singular/plural phrasing for complete months", () => {
    expect(getObservedMonthsWording(0)).toBe("No complete month history");
    expect(getObservedMonthsWording(1)).toBe("Based on 1 complete month");
    expect(getObservedMonthsWording(2)).toBe("Based on 2 complete months");
    expect(getObservedMonthsWording(3)).toBe("Based on 3 complete IST months");
  });

  it("returns appropriate badge configuration for each quality tier", () => {
    expect(getQualityBadgeConfig("complete")).toEqual({ label: "Ready", variant: "success" });
    expect(getQualityBadgeConfig("limited")).toEqual({ label: "Limited", variant: "accent" });
    expect(getQualityBadgeConfig("unavailable")).toEqual({
      label: "Unavailable",
      variant: "problem"
    });
  });

  it("detects classification limitations from limitation keys", () => {
    expect(hasClassificationLimitations(["current_category_metadata_in_use"])).toBe(false);
    expect(
      hasClassificationLimitations([
        "current_category_metadata_in_use",
        "uncategorized_expenses_present"
      ])
    ).toBe(true);
    expect(
      hasClassificationLimitations([
        "current_category_metadata_in_use",
        "ungrouped_categories_present"
      ])
    ).toBe(true);
  });
});

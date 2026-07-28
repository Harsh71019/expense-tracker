import { describe, expect, it } from "vitest";

import {
  matchesWarningFilter,
  parseSpendingWarningFilters,
  serializeSpendingWarningFilters,
  toApiKind
} from "./filters";

describe("parseSpendingWarningFilters", () => {
  it("defaults to all when no filter param is present", () => {
    expect(parseSpendingWarningFilters({})).toEqual({ filter: "all" });
  });

  it("accepts each valid filter value", () => {
    expect(parseSpendingWarningFilters({ filter: "spikes" })).toEqual({ filter: "spikes" });
    expect(parseSpendingWarningFilters({ filter: "large_expenses" })).toEqual({
      filter: "large_expenses"
    });
  });

  it("falls back to all for an invalid filter value", () => {
    expect(parseSpendingWarningFilters({ filter: "not-a-real-filter" })).toEqual({ filter: "all" });
  });

  it("reads the first value when a param repeats", () => {
    expect(parseSpendingWarningFilters({ filter: ["spikes", "large_expenses"] })).toEqual({
      filter: "spikes"
    });
  });
});

describe("serializeSpendingWarningFilters", () => {
  it("omits the param for the default all filter", () => {
    expect(serializeSpendingWarningFilters({ filter: "all" })).toBe("");
  });

  it("serializes a non-default filter", () => {
    expect(serializeSpendingWarningFilters({ filter: "large_expenses" })).toBe(
      "filter=large_expenses"
    );
  });
});

describe("toApiKind", () => {
  it("maps large_expenses onto the one matching API kind", () => {
    expect(toApiKind("large_expenses")).toBe("unusually_large_expense");
  });

  it("sends no kind filter for all or spikes", () => {
    expect(toApiKind("all")).toBeUndefined();
    expect(toApiKind("spikes")).toBeUndefined();
  });
});

describe("matchesWarningFilter", () => {
  it("matches everything under all", () => {
    expect(matchesWarningFilter("overall_spend_spike", "all")).toBe(true);
    expect(matchesWarningFilter("unusually_large_expense", "all")).toBe(true);
  });

  it("groups overall and category kinds under spikes, excluding large expenses", () => {
    expect(matchesWarningFilter("overall_spend_spike", "spikes")).toBe(true);
    expect(matchesWarningFilter("category_spend_spike", "spikes")).toBe(true);
    expect(matchesWarningFilter("unusually_large_expense", "spikes")).toBe(false);
  });

  it("only matches large expenses under large_expenses", () => {
    expect(matchesWarningFilter("unusually_large_expense", "large_expenses")).toBe(true);
    expect(matchesWarningFilter("overall_spend_spike", "large_expenses")).toBe(false);
  });
});

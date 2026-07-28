import { describe, expect, it } from "vitest";

import { parseBillFilters, serializeBillFilters } from "./bill-filters";

describe("bill filters", () => {
  it("parses and serializes valid filters", () => {
    const filters = parseBillFilters({
      reconciliationStatus: "reconciled",
      paymentStatus: "partial",
      limit: "20"
    });
    expect(filters).toEqual({
      reconciliationStatus: "reconciled",
      paymentStatus: "partial",
      limit: 20
    });
    expect(serializeBillFilters(filters)).toBe(
      "reconciliationStatus=reconciled&paymentStatus=partial&limit=20"
    );
  });

  it("falls back to the canonical defaults for invalid URLs", () => {
    expect(parseBillFilters({ paymentStatus: "late", limit: "999" })).toEqual({ limit: 50 });
  });
});

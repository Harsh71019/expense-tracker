import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatMinor, parseMinor } from "./money.js";

describe("INR money utilities", () => {
  it.each([
    ["1,250.50", 125_050],
    ["1250.5", 125_050],
    ["₹1,250", 125_000],
    ["1,25,000.00", 12_500_000],
    ["0.01", 1]
  ])("parses %s into integer paise", (input, expected) => {
    expect(parseMinor(input)).toBe(expected);
  });

  it.each(["", "-1", "12.505", "1e5", "1,23", "₹-1.00"])("rejects invalid amount %s", (input) => {
    expect(() => parseMinor(input)).toThrow(RangeError);
  });

  it("formats paise using Indian grouping without display-string arithmetic", () => {
    expect(formatMinor(12_500_050)).toBe("₹1,25,000.50");
  });

  it("round-trips 10,000 safe integer paise values", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (amountMinor) => {
        expect(parseMinor(formatMinor(amountMinor))).toBe(amountMinor);
      }),
      { numRuns: 10_000 }
    );
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  formatMinor,
  formatMinorInput,
  formatSignedCompactMinor,
  parseMinor,
  parseSafeIntegerMinor,
  sumMinorAmounts
} from "./money.js";

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
    expect(formatMinorInput(12_500_050)).toBe("125000.50");
  });

  it("formats signed compact values without client-side money arithmetic", () => {
    expect(formatSignedCompactMinor(12_500_050)).toBe("₹1.25 L");
    expect(formatSignedCompactMinor(-1_250_000_000)).toBe("−₹1.25 Cr");
    expect(formatSignedCompactMinor(12_345)).toBe("₹123.45");
  });

  it("round-trips 10,000 safe integer paise values", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (amountMinor) => {
        expect(parseMinor(formatMinor(amountMinor))).toBe(amountMinor);
      }),
      { numRuns: 10_000 }
    );
  });

  it("parses signed database bigint strings without losing paise", () => {
    expect(parseSafeIntegerMinor("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseSafeIntegerMinor("-9007199254740991")).toBe(-Number.MAX_SAFE_INTEGER);
  });

  it("rejects database aggregates outside the supported range", () => {
    expect(() => parseSafeIntegerMinor("9007199254740992")).toThrow(RangeError);
    expect(() => parseSafeIntegerMinor("-9007199254740992")).toThrow(RangeError);
  });

  it("sums through BigInt intermediates and rejects overflow", () => {
    expect(sumMinorAmounts([Number.MAX_SAFE_INTEGER - 1, 1])).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => sumMinorAmounts([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});

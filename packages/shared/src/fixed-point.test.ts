import { describe, expect, it } from "vitest";

import {
  calculateMarketValueMinor,
  microUnitsToMilliUnits,
  parsePositiveDecimalToMicroUnits,
  PriceMicroRupeesPerQuoteUnitSchema,
  PurityBpsSchema,
  QuantityMicroUnitsSchema
} from "./fixed-point.js";

describe("market fixed-point utilities", () => {
  it.each([
    ["1", 1_000_000],
    ["0.000001", 1],
    ["12.3456784", 12_345_678],
    ["12.3456785", 12_345_679],
    ["000.5000009", 500_001]
  ])("parses %s into micro-units with decimal half-up rounding", (input, expected) => {
    expect(parsePositiveDecimalToMicroUnits(input)).toBe(expected);
  });

  it.each(["", "-1", ".5", "1e3", "0", "0.0000004", "9007199254.740992"])(
    "rejects an invalid or unsupported fixed-point value: %s",
    (input) => {
      expect(() => parsePositiveDecimalToMicroUnits(input)).toThrow();
    }
  );

  it("calculates mutual-fund value in paise without floating-point arithmetic", () => {
    const units = parsePositiveDecimalToMicroUnits("123.456789");
    const nav = parsePositiveDecimalToMicroUnits("45.678901");

    expect(calculateMarketValueMinor(units, nav)).toBe(563_937);
  });

  it("rounds final paise half up and applies physical-metal purity before that rounding", () => {
    expect(calculateMarketValueMinor(100, 50_000_000)).toBe(1);
    expect(calculateMarketValueMinor(1_000_000, 7_000_000_000, 9_167)).toBe(641_690);
  });

  it("rejects zero, unsafe, and out-of-range fixed-point inputs", () => {
    expect(QuantityMicroUnitsSchema.safeParse(0).success).toBe(false);
    expect(PriceMicroRupeesPerQuoteUnitSchema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(
      false
    );
    expect(PurityBpsSchema.safeParse(10_001).success).toBe(false);
  });

  it("rejects a market value that would exceed a safe integer", () => {
    expect(() =>
      calculateMarketValueMinor(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    ).toThrow(RangeError);
  });

  it("converts physical quantities to the legacy milli-unit cache only exactly", () => {
    expect(microUnitsToMilliUnits(1_234_000)).toBe(1_234);
    expect(() => microUnitsToMilliUnits(1_234_001)).toThrow(RangeError);
  });
});

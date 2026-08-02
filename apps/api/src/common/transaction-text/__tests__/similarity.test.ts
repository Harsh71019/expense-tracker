import { describe, expect, it } from "vitest";

import {
  jaccardSimilarityBps,
  jaroSimilarityBps,
  jaroWinklerSimilarityBps
} from "../similarity.js";

describe("integer-scored text similarity", () => {
  it("calculates distinct-token Jaccard similarity in basis points", () => {
    expect(jaccardSimilarityBps(["upi", "rent", "rent"], ["rent", "august"])).toBe(3_333);
    expect(jaccardSimilarityBps(["same"], ["same"])).toBe(10_000);
    expect(jaccardSimilarityBps(["left"], ["right"])).toBe(0);
  });

  it("defines empty sets and NFKC-equivalent tokens deterministically", () => {
    expect(jaccardSimilarityBps([], [])).toBe(10_000);
    expect(jaccardSimilarityBps([], ["value"])).toBe(0);
    expect(jaccardSimilarityBps(["ＣＡＦÉ"], ["CAFÉ"])).toBe(10_000);
  });

  it.each([
    ["MARTHA", "MARHTA", 9_444],
    ["DIXON", "DICKSONX", 7_667],
    ["jones", "johnson", 7_905],
    ["abc", "xyz", 0]
  ])("calculates Jaro(%s, %s)", (left, right, expected) => {
    expect(jaroSimilarityBps(left, right)).toBe(expected);
  });

  it("applies only a bounded Jaro-Winkler prefix bonus", () => {
    expect(jaroWinklerSimilarityBps("MARTHA", "MARHTA")).toBe(9_611);
    expect(jaroWinklerSimilarityBps("DIXON", "DICKSONX")).toBe(8_134);
    expect(jaroWinklerSimilarityBps("abxxxx", "abyyyy")).toBe(
      jaroSimilarityBps("abxxxx", "abyyyy")
    );
    expect(
      jaroWinklerSimilarityBps("prefix-abcdefgh", "prefix-abcxyz", { maxPrefixLength: 0 })
    ).toBe(jaroSimilarityBps("prefix-abcdefgh", "prefix-abcxyz"));
  });

  it("normalizes Unicode compatibility forms and compares code points", () => {
    expect(jaroSimilarityBps("ＣＡＦÉ", "CAFÉ")).toBe(10_000);
    expect(jaroWinklerSimilarityBps("cafe\u0301", "café")).toBe(10_000);
    expect(jaroSimilarityBps("💳rent", "💳rent")).toBe(10_000);
  });

  it("rejects options that can violate the Winkler bound", () => {
    expect(() => jaroWinklerSimilarityBps("a", "a", { minimumJaroBps: 10_001 })).toThrow(
      RangeError
    );
    expect(() => jaroWinklerSimilarityBps("a", "a", { maxPrefixLength: 5 })).toThrow(RangeError);
    expect(() => jaroWinklerSimilarityBps("a", "a", { prefixScaleBps: 1_001 })).toThrow(RangeError);
  });

  it("preserves symmetry, identity, and score bounds across deterministic samples", () => {
    const samples = [
      "",
      "a",
      "ab",
      "martha",
      "marhta",
      "merchant one",
      "merchant 1",
      "किराना",
      "cafe\u0301",
      "café",
      "💳rent"
    ];
    for (const left of samples) {
      expect(jaroSimilarityBps(left, left)).toBe(10_000);
      expect(jaroWinklerSimilarityBps(left, left)).toBe(10_000);
      for (const right of samples) {
        const jaro = jaroSimilarityBps(left, right);
        const winkler = jaroWinklerSimilarityBps(left, right);
        expect(jaro).toBe(jaroSimilarityBps(right, left));
        expect(winkler).toBe(jaroWinklerSimilarityBps(right, left));
        expect(jaro).toBeGreaterThanOrEqual(0);
        expect(jaro).toBeLessThanOrEqual(10_000);
        expect(winkler).toBeGreaterThanOrEqual(jaro);
        expect(winkler).toBeLessThanOrEqual(10_000);
      }
    }
  });

  it("preserves Jaccard symmetry and bounds for repeated-token samples", () => {
    const documents = [[], ["a"], ["a", "a"], ["a", "b"], ["b", "c", "d"]];
    for (const left of documents) {
      for (const right of documents) {
        const score = jaccardSimilarityBps(left, right);
        expect(score).toBe(jaccardSimilarityBps(right, left));
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(10_000);
      }
    }
  });
});

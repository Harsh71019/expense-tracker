import { describe, expect, it } from "vitest";

import { calculateReviewPriority } from "../calculate-review-priority.js";

describe("calculateReviewPriority", () => {
  const asOf = new Date("2026-08-01T00:00:00.000Z");

  it("calculates priority factors accurately for a high-impact recurring change", () => {
    const factors = calculateReviewPriority({
      sourceType: "recurring_change",
      confidenceBps: 8_000,
      amountMinor: 80_000, // 800 INR
      referenceScaleMinor: 5_000_000,
      occurredAt: new Date("2026-07-25T00:00:00.000Z"), // 7 days ago -> 1,400 staleness
      asOf
    });

    expect(factors.uncertaintyBps).toBe(2_000); // 10000 - 8000
    expect(factors.downstreamImpactBps).toBe(8_500);
    expect(factors.stalenessBps).toBe(1_400); // 7 * 200
    expect(factors.compositeScore).toBeGreaterThanOrEqual(2_500);
    expect(factors.compositeScore).toBeLessThanOrEqual(10_000);
    expect(factors.explanation.toLowerCase()).toContain("recurring");
  });

  it("assigns higher uncertainty score to lower confidence items", () => {
    const highConf = calculateReviewPriority({
      sourceType: "category_suggestion",
      confidenceBps: 9_500,
      amountMinor: 20_000,
      occurredAt: asOf,
      asOf
    });

    const lowConf = calculateReviewPriority({
      sourceType: "category_suggestion",
      confidenceBps: 4_000,
      amountMinor: 20_000,
      occurredAt: asOf,
      asOf
    });

    expect(lowConf.uncertaintyBps).toBeGreaterThan(highConf.uncertaintyBps);
    expect(lowConf.compositeScore).toBeGreaterThan(highConf.compositeScore);
  });

  it("scales amount significance with larger transaction amounts", () => {
    const smallItem = calculateReviewPriority({
      sourceType: "recurring_stream",
      confidenceBps: 7_000,
      amountMinor: 5_000, // 50 INR
      referenceScaleMinor: 5_000_000,
      occurredAt: asOf,
      asOf
    });

    const largeItem = calculateReviewPriority({
      sourceType: "recurring_stream",
      confidenceBps: 7_000,
      amountMinor: 2_500_000, // 25,000 INR
      referenceScaleMinor: 5_000_000,
      occurredAt: asOf,
      asOf
    });

    expect(largeItem.amountSignificanceBps).toBeGreaterThan(smallItem.amountSignificanceBps);
    expect(largeItem.compositeScore).toBeGreaterThan(smallItem.compositeScore);
  });

  it("handles null amount and clamped bounds safely", () => {
    const factors = calculateReviewPriority({
      sourceType: "spending_regime",
      confidenceBps: 12_000, // Clamped to 10,000
      amountMinor: null,
      occurredAt: asOf,
      asOf
    });

    expect(factors.uncertaintyBps).toBe(0);
    expect(factors.amountSignificanceBps).toBe(1_000);
    expect(factors.compositeScore).toBeGreaterThanOrEqual(0);
    expect(factors.compositeScore).toBeLessThanOrEqual(10_000);
  });
});

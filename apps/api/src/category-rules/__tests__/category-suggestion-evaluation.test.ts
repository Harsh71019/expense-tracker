import { describe, expect, it } from "vitest";

import {
  compareCategorySuggestionPoliciesChronologically,
  evaluateCategorySuggestionsChronologically
} from "../category-suggestion-evaluation.js";
import type { LabeledCategorySuggestionPoint } from "../category-suggestion-evaluation.js";
import { CATEGORY_SUGGESTION_ACTIVE_POLICY } from "../category-suggestion-ranking.js";
import { CATEGORY_SUGGESTION_RESOURCE_CONTRACT } from "../category-suggestion-ranking.js";

const FOOD_ID = "123e4567-e89b-42d3-a456-426614174001";

function point(day: number, description: string): LabeledCategorySuggestionPoint {
  return {
    id: `point-${day}`,
    categoryId: FOOD_ID,
    description,
    occurredAt: new Date(Date.UTC(2026, 0, day)),
    type: "expense",
    amountMinor: 10_000
  };
}

describe("chronological category suggestion evaluation", () => {
  it("promotes approximate stages only when they improve precision and coverage over the baseline", () => {
    const startedAt = Date.now();
    const comparison = compareCategorySuggestionPoliciesChronologically(
      [point(1, "SWIGGY"), point(2, "SWIGGY"), point(3, "SWIGGYY"), point(4, "SWIGGYY")],
      []
    );

    expect(comparison.approximateStagesPromotable).toBe(true);
    expect(comparison.candidate.correctCount).toBeGreaterThan(comparison.baseline.correctCount);
    expect(comparison.candidate.top1PrecisionBps).toBe(10_000);
    expect(comparison.candidate.coverageBps).toBeGreaterThan(comparison.baseline.coverageBps);
    expect(Date.now() - startedAt).toBeLessThan(CATEGORY_SUGGESTION_RESOURCE_CONTRACT.timeoutMs);
  });

  it("uses only older rows and rejects unordered or invalid evaluation data", () => {
    const points = [point(1, "SWIGGY"), point(2, "SWIGGY"), point(3, "SWIGGYY")];
    const metrics = evaluateCategorySuggestionsChronologically(
      points,
      [],
      CATEGORY_SUGGESTION_ACTIVE_POLICY
    );
    expect(metrics).toMatchObject({ eligibleCount: 2, predictedCount: 1, correctCount: 1 });

    expect(() =>
      evaluateCategorySuggestionsChronologically(
        [points[1], points[0]].filter(
          (value): value is LabeledCategorySuggestionPoint => value !== undefined
        ),
        [],
        CATEGORY_SUGGESTION_ACTIVE_POLICY
      )
    ).toThrow(RangeError);
    expect(() =>
      evaluateCategorySuggestionsChronologically(
        [{ ...point(1, "SWIGGY"), amountMinor: 0 }],
        [],
        CATEGORY_SUGGESTION_ACTIVE_POLICY
      )
    ).toThrow(RangeError);
  });
});

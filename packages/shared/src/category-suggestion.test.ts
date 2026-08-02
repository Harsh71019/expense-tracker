import { describe, expect, it } from "vitest";

import { CategorySuggestionSchema } from "./category-suggestion.js";

describe("CategorySuggestionSchema", () => {
  it("accepts compact versioned evidence and rejects out-of-range confidence", () => {
    const suggestion = {
      categoryId: "123e4567-e89b-42d3-a456-426614174001",
      confidenceBps: 8_500,
      method: "exact_counterparty",
      evidenceCount: 4,
      algorithmVersion: 1
    } as const;
    expect(CategorySuggestionSchema.parse(suggestion)).toEqual(suggestion);
    expect(() =>
      CategorySuggestionSchema.parse({ ...suggestion, confidenceBps: 10_001 })
    ).toThrow();
    expect(() => CategorySuggestionSchema.parse({ ...suggestion, evidenceCount: 0 })).toThrow();
  });
});

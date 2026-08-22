import { describe, expect, it } from "vitest";

import {
  CATEGORY_RECOMMENDATION_ALGORITHM_VERSION,
  CategoryRecommendationQuerySchema,
  CategoryRecommendationResponseSchema,
  CategoryRecommendationSchema,
  normalizeCategorySearchText
} from "./category-recommendation.js";

const CATEGORY_ID = "123e4567-e89b-42d3-a456-426614174001";

describe("CategoryRecommendationQuerySchema", () => {
  it("accepts a UTC instant, optional description, and default limit", () => {
    expect(
      CategoryRecommendationQuerySchema.parse({
        type: "expense",
        occurredAt: "2026-08-22T06:30:00.000Z"
      })
    ).toEqual({
      type: "expense",
      occurredAt: "2026-08-22T06:30:00.000Z",
      limit: 5
    });
  });

  it("rejects date-only, offset, blank, oversized, and tenancy fields", () => {
    const valid = { type: "expense", occurredAt: "2026-08-22T06:30:00.000Z" };
    expect(() =>
      CategoryRecommendationQuerySchema.parse({ ...valid, occurredAt: "2026-08-22" })
    ).toThrow();
    expect(() =>
      CategoryRecommendationQuerySchema.parse({ ...valid, occurredAt: "2026-08-22T06:30:00+05:30" })
    ).toThrow();
    expect(() =>
      CategoryRecommendationQuerySchema.parse({ ...valid, description: "   " })
    ).toThrow();
    expect(() =>
      CategoryRecommendationQuerySchema.parse({ ...valid, description: "x".repeat(501) })
    ).toThrow();
    expect(() => CategoryRecommendationQuerySchema.parse({ ...valid, limit: 0 })).toThrow();
    expect(() => CategoryRecommendationQuerySchema.parse({ ...valid, limit: 6 })).toThrow();
    expect(() => CategoryRecommendationQuerySchema.parse({ ...valid, userId: "user-1" })).toThrow();
  });
});

describe("CategoryRecommendationSchema", () => {
  it("requires confidence for contextual reasons and rejects it for shortcuts", () => {
    const contextual = {
      categoryId: CATEGORY_ID,
      reason: "exact_counterparty" as const,
      evidenceCount: 4,
      confidenceBps: 8_500,
      algorithmVersion: CATEGORY_RECOMMENDATION_ALGORITHM_VERSION
    };
    expect(CategoryRecommendationSchema.parse(contextual)).toEqual(contextual);
    expect(() =>
      CategoryRecommendationSchema.parse({ ...contextual, confidenceBps: undefined })
    ).toThrow();

    const frequent = {
      categoryId: CATEGORY_ID,
      reason: "frequent" as const,
      evidenceCount: 12,
      algorithmVersion: CATEGORY_RECOMMENDATION_ALGORITHM_VERSION
    };
    expect(CategoryRecommendationSchema.parse(frequent)).toEqual(frequent);
    expect(() =>
      CategoryRecommendationSchema.parse({ ...frequent, confidenceBps: 4_000 })
    ).toThrow();
  });
});

describe("CategoryRecommendationResponseSchema", () => {
  it("parses an envelope without category names", () => {
    const response = {
      items: [
        {
          categoryId: CATEGORY_ID,
          reason: "recent" as const,
          evidenceCount: 1,
          algorithmVersion: CATEGORY_RECOMMENDATION_ALGORITHM_VERSION
        }
      ],
      computedAt: "2026-08-22T06:30:00.000Z",
      sourceThrough: null,
      algorithmVersion: CATEGORY_RECOMMENDATION_ALGORITHM_VERSION,
      historyRowsConsidered: 1,
      degraded: false
    };
    const parsed = CategoryRecommendationResponseSchema.parse(response);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.sourceThrough).toBeNull();
    expect(parsed.computedAt).toEqual(new Date("2026-08-22T06:30:00.000Z"));
  });
});

describe("normalizeCategorySearchText", () => {
  it("applies NFKC, trim, lowercase, and whitespace collapsing", () => {
    expect(normalizeCategorySearchText("  Café\u00a0  SWIGGY  ")).toBe("café swiggy");
    expect(normalizeCategorySearchText("SWIGGY")).toBe(normalizeCategorySearchText(" swiggy "));
    expect(normalizeCategorySearchText("uber")).not.toBe(normalizeCategorySearchText("swiggy"));
  });
});

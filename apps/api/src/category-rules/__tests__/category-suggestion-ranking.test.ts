import { AlgorithmResourceContractSchema } from "@treasury-ops/shared";
import type { CategoryRule } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  composeCategoryRecommendations,
  fillRecentCategories,
  rankFrequentCategories,
  CATEGORY_SUGGESTION_RESOURCE_CONTRACT,
  prepareCategorySuggestionHistory,
  rankCategorySuggestions
} from "../category-suggestion-ranking.js";
import type {
  CategorySuggestionHistoryItem,
  CategorySuggestionTarget
} from "../category-suggestion-ranking.js";

const FOOD_ID = "123e4567-e89b-42d3-a456-426614174001";
const TRAVEL_ID = "123e4567-e89b-42d3-a456-426614174002";

function date(day: number): Date {
  return new Date(Date.UTC(2026, 0, day));
}

function target(
  description: string,
  occurredAt: Date = date(20),
  type: "expense" | "income" = "expense"
): CategorySuggestionTarget {
  return { description, occurredAt, type };
}

function history(
  descriptions: readonly string[],
  categoryId: string = FOOD_ID,
  type: "expense" | "income" = "expense"
): CategorySuggestionHistoryItem[] {
  return descriptions.map((description, index) => ({
    id: `history-${categoryId}-${index}`,
    categoryId,
    description,
    occurredAt: date(index + 1),
    type
  }));
}

function rule(pattern: string, categoryId: string): CategoryRule {
  return {
    id: crypto.randomUUID(),
    userId: "user-1",
    pattern,
    categoryId,
    createdAt: date(1),
    updatedAt: date(1)
  };
}

describe("rankCategorySuggestions", () => {
  it("declares a valid bounded worker resource contract", () => {
    expect(AlgorithmResourceContractSchema.parse(CATEGORY_SUGGESTION_RESOURCE_CONTRACT)).toEqual(
      CATEGORY_SUGGESTION_RESOURCE_CONTRACT
    );
  });

  it("keeps longest explicit user rule first, ahead of contradictory history", () => {
    const result = rankCategorySuggestions(
      target("UPI SWIGGY INSTAMART order 42"),
      [rule("SWIGGY", TRAVEL_ID), rule("SWIGGY INSTAMART", FOOD_ID)],
      prepareCategorySuggestionHistory(
        history(["swiggy instamart", "swiggy instamart", "swiggy instamart"], TRAVEL_ID)
      )
    );

    expect(result).toEqual({
      categoryId: FOOD_ID,
      confidenceBps: 10_000,
      method: "explicit_rule",
      evidenceCount: 1,
      algorithmVersion: 1
    });
  });

  it("uses exact private counterparty memory only with three examples, calibrated share, and lead", () => {
    const result = rankCategorySuggestions(
      target("UPI/418923456789/SWIGGY/order 77"),
      [],
      prepareCategorySuggestionHistory([
        ...history([
          "UPI/111111111111/SWIGGY",
          "UPI/222222222222/SWIGGY",
          "UPI/333333333333/SWIGGY",
          "UPI/444444444444/SWIGGY"
        ]),
        ...history(["UPI/555555555555/SWIGGY"], TRAVEL_ID)
      ])
    );

    expect(result).toMatchObject({
      categoryId: FOOD_ID,
      confidenceBps: 8_000,
      method: "exact_counterparty",
      evidenceCount: 4
    });
  });

  it("abstains when exact memory is ambiguous instead of letting an approximate stage override it", () => {
    const prepared = prepareCategorySuggestionHistory([
      ...history(["SWIGGY", "SWIGGY"], FOOD_ID),
      ...history(["SWIGGY", "SWIGGY"], TRAVEL_ID)
    ]);
    expect(rankCategorySuggestions(target("SWIGGY"), [], prepared)).toBeUndefined();
  });

  it("recognizes a calibrated Jaro-Winkler private-counterparty match", () => {
    const result = rankCategorySuggestions(
      target("SWIGGYY"),
      [],
      prepareCategorySuggestionHistory(history(["SWIGGY", "SWIGGY"])),
      { approximateStages: ["jaro_winkler"] }
    );
    expect(result).toMatchObject({ categoryId: FOOD_ID, method: "jaro_winkler", evidenceCount: 2 });
  });

  it("supports calibrated Soft TF-IDF and transparent Jaccard stages", () => {
    const soft = rankCategorySuggestions(
      target("FRESH BASKTE MARKET"),
      [],
      prepareCategorySuggestionHistory(history(["FRESH BASKET MARKET", "FRESH BASKET MARKET"])),
      { approximateStages: ["soft_tf_idf"] }
    );
    const jaccard = rankCategorySuggestions(
      target("MONTHLY RENT HOME"),
      [],
      prepareCategorySuggestionHistory(history(["RENT HOME", "RENT HOME"])),
      { approximateStages: ["jaccard"] }
    );

    expect(soft).toMatchObject({ categoryId: FOOD_ID, method: "soft_tf_idf", evidenceCount: 2 });
    expect(jaccard).toMatchObject({ categoryId: FOOD_ID, method: "jaccard", evidenceCount: 2 });
  });

  it("never learns from future rows or a conflicting transaction type", () => {
    const prepared = prepareCategorySuggestionHistory([
      ...history(["SWIGGY", "SWIGGY", "SWIGGY"]).map((item) => ({ ...item, occurredAt: date(25) })),
      ...history(["SWIGGY", "SWIGGY", "SWIGGY"], FOOD_ID, "income")
    ]);
    expect(rankCategorySuggestions(target("SWIGGY"), [], prepared)).toBeUndefined();
  });

  it("abstains on sparse or disjoint private history", () => {
    expect(
      rankCategorySuggestions(
        target("IRCTC"),
        [],
        prepareCategorySuggestionHistory(history(["SWIGGY", "ZOMATO"]))
      )
    ).toBeUndefined();
  });
});

describe("composeCategoryRecommendations", () => {
  const DINING_ID = "123e4567-e89b-42d3-a456-426614174003";

  function prepared(
    rows: ReadonlyArray<{
      id: string;
      categoryId: string;
      day: number;
      description?: string;
    }>
  ): ReturnType<typeof prepareCategorySuggestionHistory> {
    return prepareCategorySuggestionHistory(
      rows.map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        description: row.description ?? "SWIGGY",
        occurredAt: date(row.day),
        type: "expense"
      }))
    );
  }

  it("places an explicit rule first and keeps it once", () => {
    const contextual = rankCategorySuggestions(
      target("UPI SWIGGY INSTAMART"),
      [rule("SWIGGY", FOOD_ID)],
      prepareCategorySuggestionHistory(history(["SWIGGY", "SWIGGY", "SWIGGY"], TRAVEL_ID))
    );
    const items = composeCategoryRecommendations(
      contextual,
      prepared([
        { id: "a", categoryId: FOOD_ID, day: 2 },
        { id: "b", categoryId: FOOD_ID, day: 3 },
        { id: "c", categoryId: TRAVEL_ID, day: 4 },
        { id: "d", categoryId: TRAVEL_ID, day: 5 }
      ]),
      5
    );
    expect(items[0]).toMatchObject({ categoryId: FOOD_ID, reason: "explicit_rule" });
    expect(items.filter((item) => item.categoryId === FOOD_ID)).toHaveLength(1);
  });

  it("keeps exact counterparties ahead of frequent shortcuts", () => {
    const historyItems = prepareCategorySuggestionHistory([
      ...history(["SWIGGY", "SWIGGY", "SWIGGY"], FOOD_ID),
      ...[4, 5, 6, 7].map((day) => ({
        id: `travel-${day}`,
        categoryId: TRAVEL_ID,
        description: "UBER",
        occurredAt: date(day),
        type: "expense" as const
      }))
    ]);
    const contextual = rankCategorySuggestions(target("SWIGGY"), [], historyItems);
    const items = composeCategoryRecommendations(contextual, historyItems, 5);
    expect(items[0]).toMatchObject({
      categoryId: FOOD_ID,
      reason: "exact_counterparty"
    });
    expect(items[1]).toMatchObject({ categoryId: TRAVEL_ID, reason: "frequent" });
  });

  it("maps approximate methods to similar_description", () => {
    const items = composeCategoryRecommendations(
      {
        categoryId: FOOD_ID,
        method: "jaro_winkler",
        confidenceBps: 9_000,
        evidenceCount: 2,
        algorithmVersion: 1
      },
      [],
      5
    );
    expect(items[0]).toMatchObject({ reason: "similar_description", confidenceBps: 9_000 });
  });

  it("does not invent a contextual item when exact matching is ambiguous", () => {
    const historyItems = prepareCategorySuggestionHistory([
      ...history(["SWIGGY", "SWIGGY", "SWIGGY"], FOOD_ID),
      ...history(["SWIGGY", "SWIGGY"], TRAVEL_ID)
    ]);
    const contextual = rankCategorySuggestions(target("SWIGGY"), [], historyItems);
    expect(contextual).toBeUndefined();
    const items = composeCategoryRecommendations(contextual, historyItems, 5);
    expect(items.every((item) => item.reason === "frequent" || item.reason === "recent")).toBe(
      true
    );
  });

  it("sorts frequent categories by count, recency, transaction id, then category id", () => {
    const items = rankFrequentCategories(
      prepared([
        { id: "food-late", categoryId: FOOD_ID, day: 8 },
        { id: "food-early", categoryId: FOOD_ID, day: 1 },
        { id: "travel-b", categoryId: TRAVEL_ID, day: 8 },
        { id: "travel-a", categoryId: TRAVEL_ID, day: 8 },
        { id: "dining-a", categoryId: DINING_ID, day: 9 },
        { id: "dining-b", categoryId: DINING_ID, day: 2 }
      ])
    );
    expect(items.map((item) => item.categoryId)).toEqual([DINING_ID, FOOD_ID, TRAVEL_ID]);
  });

  it("fills recent distinct categories newest first and keeps one-use out of frequent", () => {
    const historyItems = prepared([
      { id: "one-off", categoryId: DINING_ID, day: 9 },
      { id: "food-1", categoryId: FOOD_ID, day: 8 },
      { id: "food-2", categoryId: FOOD_ID, day: 7 }
    ]);
    expect(rankFrequentCategories(historyItems).map((item) => item.categoryId)).toEqual([FOOD_ID]);
    expect(fillRecentCategories(historyItems, new Set()).map((item) => item.categoryId)).toEqual([
      DINING_ID,
      FOOD_ID
    ]);
  });

  it("honors limit 1 and 5 and is stable across reruns", () => {
    const historyItems = prepared([
      { id: "a1", categoryId: FOOD_ID, day: 1 },
      { id: "a2", categoryId: FOOD_ID, day: 2 },
      { id: "b1", categoryId: TRAVEL_ID, day: 3 },
      { id: "c1", categoryId: DINING_ID, day: 4 }
    ]);
    expect(composeCategoryRecommendations(undefined, historyItems, 1)).toHaveLength(1);
    const first = composeCategoryRecommendations(undefined, historyItems, 5);
    const second = composeCategoryRecommendations(undefined, [...historyItems], 5);
    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
  });

  it("skips contextual work for callers that already abstained on blank descriptions", () => {
    expect(composeCategoryRecommendations(undefined, [], 5)).toEqual([]);
  });
});

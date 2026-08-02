import { AlgorithmResourceContractSchema } from "@treasury-ops/shared";
import type { CategoryRule } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
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

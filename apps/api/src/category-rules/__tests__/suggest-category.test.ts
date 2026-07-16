import type { CategoryRule } from "@vyaya/shared";
import { describe, expect, it } from "vitest";

import { suggestCategory } from "../suggest-category.js";

function rule(pattern: string, categoryId: string): CategoryRule {
  return {
    id: "507f1f77bcf86cd799439011",
    userId: "user-a",
    pattern,
    categoryId,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe("suggestCategory", () => {
  const foodId = "507f1f77bcf86cd799439001";
  const travelId = "507f1f77bcf86cd799439002";
  const instamartId = "507f1f77bcf86cd799439003";

  it("matches case-insensitively", () => {
    expect(suggestCategory("SWIGGY ORDER #123", [rule("swiggy", foodId)])).toBe(foodId);
    expect(suggestCategory("swiggy order #123", [rule("SWIGGY", foodId)])).toBe(foodId);
  });

  it("matches a substring anywhere in the description", () => {
    expect(suggestCategory("IRCTC/TICKET/12345", [rule("IRCTC", travelId)])).toBe(travelId);
  });

  it("returns undefined when nothing matches", () => {
    expect(suggestCategory("Rent payment", [rule("SWIGGY", foodId)])).toBeUndefined();
  });

  it("returns undefined for an empty rule set", () => {
    expect(suggestCategory("SWIGGY", [])).toBeUndefined();
  });

  it("prefers the longest (most specific) matching pattern", () => {
    const rules = [rule("SWIGGY", foodId), rule("SWIGGY INSTAMART", instamartId)];
    expect(suggestCategory("SWIGGY INSTAMART ORDER", rules)).toBe(instamartId);
    expect(suggestCategory("SWIGGY ORDER", rules)).toBe(foodId);
  });
});

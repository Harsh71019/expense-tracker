import { describe, expect, it } from "vitest";

import { matchesSearch, textContains } from "./category-picker-search";

describe("category picker search", () => {
  it("matches a category name substring", () => {
    expect(textContains("dining", "din")).toBe(true);
    expect(
      matchesSearch(
        {
          id: "123e4567-e89b-42d3-a456-426614174002",
          userId: "user-1",
          name: "Dining",
          kind: "expense",
          isArchived: false,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        },
        "Groceries",
        "din"
      )
    ).toBe(true);
    expect(textContains("dining", "dine")).toBe(false);
  });
});

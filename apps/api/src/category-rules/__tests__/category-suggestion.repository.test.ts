import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { CategorySuggestionRepository } from "../category-suggestion.repository.js";

const ROW = {
  id: "123e4567-e89b-42d3-a456-426614174010",
  categoryId: "123e4567-e89b-42d3-a456-426614174001",
  description: "UPI SWIGGY",
  occurredAt: new Date("2026-01-01T00:00:00.000Z"),
  type: "expense" as const
};

describe("CategorySuggestionRepository", () => {
  it("returns only the feature fields and applies the requested bound", async () => {
    const db = createMockDrizzleDb([ROW]);
    const history = await new CategorySuggestionRepository(db).findHistory(
      "user-1",
      "expense",
      new Date("2026-02-01T00:00:00.000Z"),
      10
    );

    expect(history).toEqual([ROW]);
  });

  it("rejects invalid dates and limits outside the hard history ceiling", async () => {
    const repository = new CategorySuggestionRepository(createMockDrizzleDb());
    await expect(
      repository.findHistory("user-1", "expense", new Date("invalid"))
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repository.findHistory("user-1", "expense", new Date(), 501)
    ).rejects.toBeInstanceOf(RangeError);
    await expect(repository.findHistory("user-1", "expense", new Date(), 0)).rejects.toBeInstanceOf(
      RangeError
    );
  });
});

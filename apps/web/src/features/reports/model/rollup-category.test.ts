import type { Category } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { rollupCategoryMeta } from "./rollup-category";

const groceries: Category = {
  id: "507f1f77bcf86cd799439011",
  userId: "u1",
  name: "Groceries",
  kind: "expense",
  icon: "🛒",
  color: "#f97316",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("rollupCategoryMeta", () => {
  it("treats an absent categoryId as the Uncategorized bucket", () => {
    expect(rollupCategoryMeta(undefined, [groceries])).toEqual({
      name: "Uncategorized",
      icon: "∅",
      color: "#71817a"
    });
  });

  it("resolves a known category's name, icon, and colour", () => {
    expect(rollupCategoryMeta(groceries.id, [groceries])).toEqual({
      name: "Groceries",
      icon: "🛒",
      color: "#f97316"
    });
  });

  it("falls back gracefully for a categoryId that no longer resolves", () => {
    expect(rollupCategoryMeta("507f1f77bcf86cd799439099", [groceries])).toEqual({
      name: "Unavailable category",
      icon: "?",
      color: "#71817a"
    });
  });

  it("falls back to the first-letter glyph when a resolved category has no icon", () => {
    const noIcon: Category = { ...groceries, icon: undefined, color: undefined };
    expect(rollupCategoryMeta(noIcon.id, [noIcon])).toEqual({
      name: "Groceries",
      icon: "G",
      color: "#71817a"
    });
  });
});

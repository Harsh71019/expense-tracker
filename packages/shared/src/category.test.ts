import { describe, expect, it } from "vitest";

import {
  CreateCategorySchema,
  ListCategoriesQuerySchema,
  UpdateCategorySchema
} from "./category.js";

describe("category schemas", () => {
  it("accepts expanded icon identifiers and six-digit hex colours", () => {
    expect(
      CreateCategorySchema.parse({
        name: "Health",
        kind: "expense",
        icon: "heart-pulse",
        color: "#EC4899"
      })
    ).toMatchObject({ icon: "heart-pulse", color: "#EC4899" });
  });

  it("supports clearing editable visual and parent fields", () => {
    expect(
      UpdateCategorySchema.parse({
        name: "Health",
        icon: null,
        color: null,
        parentId: null
      })
    ).toEqual({ name: "Health", icon: null, color: null, parentId: null });
  });

  it("parses includeArchived only from an explicit true query value", () => {
    expect(ListCategoriesQuerySchema.parse({}).includeArchived).toBe(false);
    expect(ListCategoriesQuerySchema.parse({ includeArchived: "true" }).includeArchived).toBe(true);
    expect(ListCategoriesQuerySchema.parse({ includeArchived: "false" }).includeArchived).toBe(
      false
    );
  });

  it("rejects invalid custom colours", () => {
    expect(() =>
      UpdateCategorySchema.parse({
        name: "Health",
        icon: null,
        color: "pink",
        parentId: null
      })
    ).toThrow("Colour must be a six-digit hex value.");
  });
});

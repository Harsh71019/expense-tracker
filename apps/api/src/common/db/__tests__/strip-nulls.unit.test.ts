import { describe, expect, it } from "vitest";

import { stripNulls } from "../strip-nulls.js";

describe("stripNulls", () => {
  it("converts null values in flat object to undefined", () => {
    const input = {
      id: "123",
      name: "Test Account",
      description: null,
      parentCategoryId: null,
      amountMinor: 500
    };

    const output = stripNulls(input);

    expect(output).toEqual({
      id: "123",
      name: "Test Account",
      description: undefined,
      parentCategoryId: undefined,
      amountMinor: 500
    });
  });

  it("handles empty objects", () => {
    expect(stripNulls({})).toEqual({});
  });

  it("leaves non-null values unchanged", () => {
    const input = { a: 1, b: "hello", c: false, d: [1, 2], e: { nested: true } };
    expect(stripNulls(input)).toEqual(input);
  });
});

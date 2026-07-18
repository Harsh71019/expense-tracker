import { describe, expect, it } from "vitest";

import { glyphFor, lighten, tint } from "./palette";

describe("lighten", () => {
  it("mixes the colour toward white by the given amount", () => {
    expect(lighten("#000000", 0.5)).toBe("rgb(128, 128, 128)");
  });

  it("returns the original colour unchanged at amount 0", () => {
    expect(lighten("#336699", 0)).toBe("rgb(51, 102, 153)");
  });
});

describe("tint", () => {
  it("converts a hex colour to an rgba string with the given alpha", () => {
    expect(tint("#ff0000", 0.4)).toBe("rgba(255, 0, 0, 0.4)");
  });

  it("defaults to a low alpha when none is given", () => {
    expect(tint("#00ff00")).toBe("rgba(0, 255, 0, 0.16)");
  });
});

describe("glyphFor", () => {
  it("prefers the category's icon when set", () => {
    expect(glyphFor({ icon: "🍽", name: "Food" })).toBe("🍽");
  });

  it("falls back to the uppercased first letter of the name", () => {
    expect(glyphFor({ name: "shopping" })).toBe("S");
  });
});

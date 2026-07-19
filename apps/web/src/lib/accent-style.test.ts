import { describe, expect, it } from "vitest";

import { accentChoiceStyle, accentDataAttribute } from "./accent-style";

describe("accent root presentation", () => {
  it("adds no overrides for the default", () => {
    expect(accentDataAttribute({ kind: "default" })).toBeUndefined();
    expect(accentChoiceStyle({ kind: "default" })).toBeUndefined();
  });

  it("uses the known data attribute for presets", () => {
    expect(accentDataAttribute({ kind: "preset", preset: "indigo" })).toBe("indigo");
    expect(accentChoiceStyle({ kind: "preset", preset: "indigo" })).toBeUndefined();
  });

  it("emits only derived namespaced properties for custom colors", () => {
    const preference = { kind: "custom", color: "#1d4ed8" } as const;
    const style = accentChoiceStyle(preference);

    expect(accentDataAttribute(preference)).toBe("custom");
    expect(style).toEqual(
      expect.objectContaining({
        "--accent-choice-light": "#1d4ed8",
        "--accent-choice-dark": "#1d4ed8"
      })
    );
    expect(JSON.stringify(style)).not.toContain("var(");
  });
});

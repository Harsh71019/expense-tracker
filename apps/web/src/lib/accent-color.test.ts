import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  deriveCustomAccentTokens,
  parseColorInput,
  resemblesExpenseColor
} from "./accent-color";
import type { NormalizedHex } from "./accent-color";

function color(input: string): NormalizedHex {
  const parsed = parseColorInput(input);
  if (!parsed.success) {
    throw new Error(parsed.message);
  }
  return parsed.color;
}

describe("parseColorInput", () => {
  it.each([
    ["#f00", "#ff0000"],
    [" #1D4ED8 ", "#1d4ed8"],
    ["rgb(29, 78, 216)", "#1d4ed8"],
    ["RGB(255, 0, 0)", "#ff0000"],
    ["hsl(0, 100%, 50%)", "#ff0000"],
    ["hsl(360, 100%, 50%)", "#ff0000"],
    ["hsl(-120, 100%, 50%)", "#0000ff"]
  ])("normalizes %s to %s", (input, expected) => {
    expect(parseColorInput(input)).toEqual({ success: true, color: expected });
  });

  it.each([
    "",
    "red",
    "#abcd",
    "#11223344",
    "rgb(256, 0, 0)",
    "rgba(1, 2, 3, 0.5)",
    "hsl(0, 101%, 50%)",
    "hsla(0, 1%, 2%, 0.5)",
    "var(--expense)",
    "url(javascript:alert(1))"
  ])("rejects unsupported input %s", (input) => {
    expect(parseColorInput(input).success).toBe(false);
  });

  it("rejects non-string boundary values", () => {
    expect(parseColorInput(null).success).toBe(false);
    expect(parseColorInput(new File([], "color.txt")).success).toBe(false);
  });
});

describe("deriveCustomAccentTokens", () => {
  it.each(["#000000", "#ffffff", "#777777", "#ff0000", "#1d4ed8"])(
    "derives accessible deterministic variants for %s",
    (input) => {
      const normalized = color(input);
      const first = deriveCustomAccentTokens(normalized);
      const second = deriveCustomAccentTokens(normalized);

      expect(first).toEqual(second);
      expect(contrastRatio(first.light.accent, color("#f6f8f6"))).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(first.dark.accent, color("#000000"))).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(first.light.accent, first.light.foreground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(first.dark.accent, first.dark.foreground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(first.light.strong, first.light.foreground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(first.dark.strong, first.dark.foreground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(first.light.strong, color("#f6f8f6"))).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(first.dark.strong, color("#000000"))).toBeGreaterThanOrEqual(3);
    }
  );

  it("keeps an already compliant custom hue recognizable", () => {
    const tokens = deriveCustomAccentTokens(color("#1d4ed8"));
    expect(tokens.light.accent).toBe("#1d4ed8");
    expect(tokens.dark.accent).toBe("#1d4ed8");
  });

  it.each([
    ["default light", "#0f9d63", "#10a367", "#04140d", "#f6f8f6"],
    ["default dark", "#34d399", "#2cb382", "#04140d", "#000000"],
    ["ocean light", "#1d4ed8", "#1e40af", "#ffffff", "#f6f8f6"],
    ["ocean dark", "#60a5fa", "#3b82f6", "#071426", "#000000"],
    ["indigo light", "#4338ca", "#3730a3", "#ffffff", "#f6f8f6"],
    ["indigo dark", "#818cf8", "#6d70f3", "#0b1028", "#000000"],
    ["violet light", "#7e22ce", "#6b21a8", "#ffffff", "#f6f8f6"],
    ["violet dark", "#c084fc", "#a855f7", "#1b0826", "#000000"],
    ["amber light", "#b45309", "#92400e", "#ffffff", "#f6f8f6"],
    ["amber dark", "#fbbf24", "#f59e0b", "#211300", "#000000"]
  ])("keeps the %s preset accessible", (_name, accent, strong, foreground, surface) => {
    const accentColor = color(accent);
    const strongColor = color(strong);
    const foregroundColor = color(foreground);
    const surfaceColor = color(surface);

    expect(contrastRatio(accentColor, foregroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(strongColor, foregroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accentColor, surfaceColor)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(strongColor, surfaceColor)).toBeGreaterThanOrEqual(3);
  });
});

describe("resemblesExpenseColor", () => {
  it("recognizes saturated reds without treating other accents as expenses", () => {
    expect(resemblesExpenseColor(color("#ff0000"))).toBe(true);
    expect(resemblesExpenseColor(color("#1d4ed8"))).toBe(false);
    expect(resemblesExpenseColor(color("#777777"))).toBe(false);
  });
});

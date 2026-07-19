import { describe, expect, it } from "vitest";

import { isAccentPreset, parseAccentCookie, serializeAccentPreference } from "./accent";

describe("isAccentPreset", () => {
  it.each(["default", "ocean", "indigo", "violet", "amber"])("accepts %s", (value) => {
    expect(isAccentPreset(value)).toBe(true);
  });

  it.each([undefined, "", "green", "Ocean", "custom"])("rejects %s", (value) => {
    expect(isAccentPreset(value)).toBe(false);
  });
});

describe("accent cookie serialization", () => {
  it.each([
    [undefined, { kind: "default" }],
    ["preset:ocean", { kind: "preset", preset: "ocean" }],
    ["custom:1d4ed8", { kind: "custom", color: "#1d4ed8" }],
    ["preset:default", { kind: "default" }],
    ["preset:unknown", { kind: "default" }],
    ["custom:abc", { kind: "default" }],
    ["custom:11223344", { kind: "default" }],
    ["custom:zzzzzz", { kind: "default" }],
    ["custom:1d4ed8;background:red", { kind: "default" }]
  ])("parses %s safely", (stored, expected) => {
    expect(parseAccentCookie(stored)).toEqual(expected);
  });

  it("serializes every preference shape canonically", () => {
    expect(serializeAccentPreference({ kind: "default" })).toBeNull();
    expect(serializeAccentPreference({ kind: "preset", preset: "violet" })).toBe("preset:violet");
    expect(serializeAccentPreference({ kind: "custom", color: "#1d4ed8" })).toBe("custom:1d4ed8");
  });
});

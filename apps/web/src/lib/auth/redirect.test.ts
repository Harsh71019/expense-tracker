import { describe, expect, it } from "vitest";

import { getSafeCallbackPath } from "./redirect";

describe("getSafeCallbackPath", () => {
  it.each([
    ["/transactions?account=cash", "/transactions?account=cash"],
    ["/", "/"],
    [null, "/"],
    ["https://attacker.invalid", "/"],
    ["//attacker.invalid", "/"],
    ["/\\attacker.invalid", "/"]
  ])("maps %s to %s", (value, expected) => {
    expect(getSafeCallbackPath(value)).toBe(expected);
  });
});

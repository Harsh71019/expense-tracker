import { describe, expect, it } from "vitest";

import { buildAuthHref, getSafeCallbackPath } from "./redirect";

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

describe("buildAuthHref", () => {
  it("encodes an internal callback and additional state", () => {
    expect(buildAuthHref("/login", "/transactions?account=cash", { registered: "1" })).toBe(
      "/login?registered=1&next=%2Ftransactions%3Faccount%3Dcash"
    );
  });

  it("omits the default callback path", () => {
    expect(buildAuthHref("/register", "/")).toBe("/register");
  });
});

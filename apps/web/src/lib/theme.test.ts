import { describe, expect, it } from "vitest";

import { isTheme } from "./theme";

describe("isTheme", () => {
  it.each(["light", "dark"])("accepts %s", (value) => {
    expect(isTheme(value)).toBe(true);
  });

  it.each([undefined, "", "system", "Dark"])("rejects %s", (value) => {
    expect(isTheme(value)).toBe(false);
  });
});

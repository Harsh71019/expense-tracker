import { describe, expect, it } from "vitest";

import { settingsTabFromParam, settingsTabHref } from "./settings-tabs";

describe("settings tabs", () => {
  it.each([
    [undefined, "profile"],
    ["profile", "profile"],
    ["appearance", "appearance"],
    ["management", "management"],
    ["unknown", "profile"],
    [["appearance", "management"], "profile"]
  ] as const)("resolves %j to %s", (value, expected) => {
    expect(settingsTabFromParam(value)).toBe(expected);
  });

  it("uses a clean URL for the default tab and query URLs for the others", () => {
    expect(settingsTabHref("profile")).toBe("/settings");
    expect(settingsTabHref("appearance")).toBe("/settings?tab=appearance");
    expect(settingsTabHref("management")).toBe("/settings?tab=management");
  });
});

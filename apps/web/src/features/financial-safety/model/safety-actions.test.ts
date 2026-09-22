import { SafetyActionKeySchema } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { getSafetyActionConfig, SAFETY_ACTION_MAP } from "./safety-actions.js";

describe("SAFETY_ACTION_MAP", () => {
  it("has an entry for every closed action key", () => {
    for (const key of SafetyActionKeySchema.options) {
      expect(Object.hasOwn(SAFETY_ACTION_MAP, key)).toBe(true);
    }
  });

  it("maps `none` to no route", () => {
    expect(SAFETY_ACTION_MAP.none).toBeNull();
  });

  it("gives every configured action a route starting with a leading slash", () => {
    for (const [key, config] of Object.entries(SAFETY_ACTION_MAP)) {
      if (key === "none") continue;
      expect(config?.href.startsWith("/")).toBe(true);
    }
  });
});

describe("getSafetyActionConfig", () => {
  it("resolves a real action key to its config", () => {
    const config = getSafetyActionConfig("configure_protection");
    expect(config?.href).toBe("/settings?tab=protection");
  });

  it("returns null for `none`, null, and undefined", () => {
    expect(getSafetyActionConfig("none")).toBeNull();
    expect(getSafetyActionConfig(null)).toBeNull();
    expect(getSafetyActionConfig(undefined)).toBeNull();
  });
});

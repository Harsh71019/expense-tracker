import { FINANCIAL_DIAGNOSTIC_ACTION_KEYS } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { DIAGNOSTIC_ACTION_MAP, getDiagnosticActionConfig } from "./diagnostic-actions";

describe("DIAGNOSTIC_ACTION_MAP", () => {
  it("provides exhaustive routing for all shared action keys", () => {
    for (const key of FINANCIAL_DIAGNOSTIC_ACTION_KEYS) {
      const config = DIAGNOSTIC_ACTION_MAP[key];
      expect(config).toBeDefined();
      expect(config.key).toBe(key);
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.href).toMatch(/^\/[a-zA-Z0-9_/?=-]*$/); // Strictly internal paths only
      expect(config.href).not.toMatch(/^https?:\/\//i); // Zero external URLs
      expect(config.href).not.toMatch(/^javascript:/i); // Zero protocol handlers
    }
  });

  it("routes configure_safety_buffer to the goals page with drawer query", () => {
    expect(DIAGNOSTIC_ACTION_MAP.configure_safety_buffer.href).toBe("/goals?safety-buffer=open");
  });

  it("safely handles null or undefined action keys", () => {
    expect(getDiagnosticActionConfig(null)).toBeNull();
    expect(getDiagnosticActionConfig(undefined)).toBeNull();
  });
});

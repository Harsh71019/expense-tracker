import { describe, expect, it } from "vitest";

import { previousMonth } from "../month.js";

describe("previousMonth", () => {
  it("steps back a month within the same year", () => {
    expect(previousMonth("2026-08")).toBe("2026-07");
  });

  it("rolls back across a year boundary", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});

import { describe, expect, it } from "vitest";

import { parseBasisPoints } from "./asset-form";

describe("parseBasisPoints", () => {
  it("converts display percentages exactly", () => {
    expect(parseBasisPoints("7.25")).toBe(725);
    expect(parseBasisPoints("8")).toBe(800);
    expect(parseBasisPoints("0.5")).toBe(50);
  });

  it("rejects excessive precision and rates over 100 percent", () => {
    expect(parseBasisPoints("7.255")).toBeUndefined();
    expect(parseBasisPoints("100.01")).toBeUndefined();
  });
});

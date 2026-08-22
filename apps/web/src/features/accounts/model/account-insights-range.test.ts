import { describe, expect, it } from "vitest";

import { parseAccountInsightsRange } from "./account-insights-range";

describe("parseAccountInsightsRange", () => {
  it("parses supported URL ranges and defaults invalid input", () => {
    expect(parseAccountInsightsRange({ range: "90d" })).toBe("90d");
    expect(parseAccountInsightsRange({ range: ["1y", "30d"] })).toBe("1y");
    expect(parseAccountInsightsRange({ range: "7d" })).toBe("30d");
    expect(parseAccountInsightsRange({})).toBe("30d");
  });
});

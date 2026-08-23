import { describe, expect, it } from "vitest";

import { parseAmfiNavFeed } from "../amfi-nav.service.js";

describe("parseAmfiNavFeed", () => {
  it("retains only requested scheme rows and converts NAV without floating point", () => {
    const feed = [
      "Open Ended Schemes ( Equity Scheme - Multi Cap Fund )",
      "100001;INF000000001;INF000000002;Example Equity Fund - Direct Growth;123.4567897;22-Aug-2026",
      "100002;INF000000003;INF000000004;Untracked Fund;456.789;22-Aug-2026"
    ].join("\n");

    const quotes = parseAmfiNavFeed(feed, new Set(["100001"]));

    expect(quotes).toEqual(
      new Map([
        [
          "100001",
          {
            schemeCode: "100001",
            priceMicroRupeesPerUnit: 123_456_790,
            providerAsOf: new Date("2026-08-22T00:00:00.000Z")
          }
        ]
      ])
    );
  });

  it("ignores malformed and non-positive provider rows instead of fabricating a quote", () => {
    const feed = [
      "100001;INF000000001;INF000000002;Example Fund;0;22-Aug-2026",
      "100002;INF000000003;INF000000004;Example Fund;12.4;invalid-date",
      "100003;INF000000005;INF000000006;Example Fund;12.4;22-Aug-2026"
    ].join("\n");

    const quotes = parseAmfiNavFeed(feed, new Set(["100001", "100002"]));

    expect(quotes).toEqual(new Map());
  });
});

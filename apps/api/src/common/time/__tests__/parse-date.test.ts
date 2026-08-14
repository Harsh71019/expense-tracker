import { describe, expect, it } from "vitest";

import { parseExplicitDate } from "../parse-date.js";

describe("parseExplicitDate", () => {
  it("parses DD/MM/YYYY", () => {
    const date = parseExplicitDate("04/07/2026", "DD/MM/YYYY");
    expect(date.toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });

  it("parses MM/DD/YYYY", () => {
    const date = parseExplicitDate("07/04/2026", "MM/DD/YYYY");
    expect(date.toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });

  it("parses YYYY-MM-DD", () => {
    const date = parseExplicitDate("2026-07-04", "YYYY-MM-DD");
    expect(date.toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });

  it("never auto-detects a different format — 04/07/2026 under MM/DD/YYYY is April 7th, not July 4th", () => {
    const date = parseExplicitDate("04/07/2026", "MM/DD/YYYY");
    expect(date.toISOString()).toBe("2026-04-07T00:00:00.000Z");
  });

  it("accepts single-digit day/month with a permissive separator width", () => {
    const date = parseExplicitDate("4/7/2026", "DD/MM/YYYY");
    expect(date.toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });

  it("rejects a non-existent calendar date instead of rolling it over", () => {
    expect(() => parseExplicitDate("30/02/2026", "DD/MM/YYYY")).toThrow(RangeError);
  });

  it("accepts a real leap day", () => {
    const date = parseExplicitDate("29/02/2028", "DD/MM/YYYY");
    expect(date.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("rejects a leap day in a non-leap year", () => {
    expect(() => parseExplicitDate("29/02/2026", "DD/MM/YYYY")).toThrow(RangeError);
  });

  it("rejects an out-of-range month", () => {
    expect(() => parseExplicitDate("15/13/2026", "DD/MM/YYYY")).toThrow(RangeError);
  });

  it("rejects input that doesn't match the format's shape at all", () => {
    expect(() => parseExplicitDate("2026/07/04", "DD/MM/YYYY")).toThrow(RangeError);
    expect(() => parseExplicitDate("not-a-date", "YYYY-MM-DD")).toThrow(RangeError);
  });

  it("trims surrounding whitespace", () => {
    const date = parseExplicitDate("  04/07/2026  ", "DD/MM/YYYY");
    expect(date.toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });

  it("accepts a 2-digit year under DD/MM/YYYY and expands it into the 2000s", () => {
    const date = parseExplicitDate("01/08/26", "DD/MM/YYYY");
    expect(date.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("accepts a 2-digit year under MM/DD/YYYY and expands it into the 2000s", () => {
    const date = parseExplicitDate("08/01/26", "MM/DD/YYYY");
    expect(date.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("still rejects a 2-digit year under YYYY-MM-DD — that format's year is always written in full", () => {
    expect(() => parseExplicitDate("26-08-01", "YYYY-MM-DD")).toThrow(RangeError);
  });

  it("rejects a 3-digit year as ambiguous rather than guessing", () => {
    expect(() => parseExplicitDate("01/08/026", "DD/MM/YYYY")).toThrow(RangeError);
  });

  it("still rejects a non-existent calendar date with a 2-digit year", () => {
    expect(() => parseExplicitDate("30/02/26", "DD/MM/YYYY")).toThrow(RangeError);
  });
});

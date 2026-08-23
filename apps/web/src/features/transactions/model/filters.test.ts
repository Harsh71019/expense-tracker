import { describe, expect, it } from "vitest";

import {
  endOfISTDay,
  isSameISTDay,
  parseTransactionFilters,
  serializeTransactionFilters,
  startOfISTDay,
  toISTDateInputValue
} from "./filters";

const accountId = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const categoryId = "3fa85f64-5717-4562-b3fc-2c963f66beff";

describe("transaction URL filters", () => {
  it("parses valid route state into the shared list-query contract", () => {
    expect(
      parseTransactionFilters({
        accountId,
        categoryId,
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-16T00:00:00.000Z",
        q: "groceries",
        tag: "goal:laptop",
        cursor: "2026-07-10T00:00:00.000Z_3fa85f64-5717-4562-b3fc-2c963f66be10",
        limit: "25"
      })
    ).toEqual({
      accountId,
      categoryId,
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-16T00:00:00.000Z"),
      q: "groceries",
      tag: "goal:laptop",
      cursor: "2026-07-10T00:00:00.000Z_3fa85f64-5717-4562-b3fc-2c963f66be10",
      limit: 25,
      sort: "date_desc"
    });
  });

  it("uses the first repeated value and keeps the documented default limit and sort", () => {
    expect(
      parseTransactionFilters({ accountId: [accountId, "3fa85f64-5717-4562-b3fc-2c963f66bef0"] })
    ).toEqual({ accountId, limit: 50, sort: "date_desc" });
  });

  it("fails closed for malformed URL state", () => {
    expect(parseTransactionFilters({ accountId: "not-an-object-id", limit: "1000" })).toEqual({
      limit: 50,
      sort: "date_desc"
    });
  });

  it("parses and serializes amount filters and sort options", () => {
    const exactFilters = parseTransactionFilters({
      amountMinor: "10000",
      sort: "amount_desc"
    });
    expect(exactFilters).toEqual({
      amountMinor: 10000,
      sort: "amount_desc",
      limit: 50
    });
    expect(serializeTransactionFilters(exactFilters)).toBe("amountMinor=10000&sort=amount_desc");

    const rangeFilters = parseTransactionFilters({
      minAmountMinor: "5000",
      maxAmountMinor: "20000",
      sort: "amount_asc"
    });
    expect(rangeFilters).toEqual({
      minAmountMinor: 5000,
      maxAmountMinor: 20000,
      sort: "amount_asc",
      limit: 50
    });
    expect(serializeTransactionFilters(rangeFilters)).toBe(
      "minAmountMinor=5000&maxAmountMinor=20000&sort=amount_asc"
    );
  });

  it("serializes filters in canonical order and omits default limit and default date_desc sort", () => {
    expect(
      serializeTransactionFilters({
        accountId,
        categoryId,
        from: new Date("2026-07-01T00:00:00.000Z"),
        to: new Date("2026-07-16T00:00:00.000Z"),
        q: "groceries & household",
        tag: "goal:laptop",
        cursor: "cursor-1",
        limit: 50,
        sort: "date_desc"
      })
    ).toBe(
      "accountId=3fa85f64-5717-4562-b3fc-2c963f66beef&categoryId=3fa85f64-5717-4562-b3fc-2c963f66beff&from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-16T00%3A00%3A00.000Z&q=groceries+%26+household&tag=goal%3Alaptop&cursor=cursor-1"
    );
  });

  it("round-trips the uncategorized filter", () => {
    expect(parseTransactionFilters({ uncategorized: "true" })).toEqual({
      uncategorized: true,
      limit: 50,
      sort: "date_desc"
    });
    expect(serializeTransactionFilters({ uncategorized: true, limit: 50 })).toBe(
      "uncategorized=true"
    );
  });

  it("includes a non-default page size", () => {
    expect(serializeTransactionFilters({ accountId, limit: 25 })).toBe(
      "accountId=3fa85f64-5717-4562-b3fc-2c963f66beef&limit=25"
    );
  });

  describe("Rupee and minor conversion helpers", () => {
    it("converts rupee string to integer paise minor units", async () => {
      const { parseRupeesToMinor, minorToRupeesInput } = await import("./filters");
      expect(parseRupeesToMinor("100")).toBe(10000);
      expect(parseRupeesToMinor("100.50")).toBe(10050);
      expect(parseRupeesToMinor("1,500")).toBe(150000);
      expect(parseRupeesToMinor("")).toBeUndefined();
      expect(parseRupeesToMinor("abc")).toBeUndefined();
      expect(parseRupeesToMinor("-50")).toBeUndefined();
      expect(parseRupeesToMinor("0")).toBeUndefined();

      expect(minorToRupeesInput(10000)).toBe("100");
      expect(minorToRupeesInput(10050)).toBe("100.50");
      expect(minorToRupeesInput(undefined)).toBe("");
    });
  });

  describe("IST date helpers", () => {
    it("converts YYYY-MM-DD to IST start and end UTC timestamps", () => {
      const start = startOfISTDay("2026-08-15");
      const end = endOfISTDay("2026-08-15");

      expect(start).toBeDefined();
      expect(end).toBeDefined();
      // Aug 15 00:00:00 IST is Aug 14 18:30:00 UTC
      expect(start?.toISOString()).toBe("2026-08-14T18:30:00.000Z");
      // Aug 15 23:59:59.999 IST is Aug 15 18:29:59.999 UTC
      expect(end?.toISOString()).toBe("2026-08-15T18:29:59.999Z");
    });

    it("returns undefined for empty or invalid date strings", () => {
      expect(startOfISTDay("")).toBeUndefined();
      expect(startOfISTDay("not-a-date")).toBeUndefined();
      expect(endOfISTDay("")).toBeUndefined();
      expect(endOfISTDay("not-a-date")).toBeUndefined();
    });

    it("formats dates to YYYY-MM-DD in Asia/Kolkata timezone", () => {
      // Midnight in India
      const istStart = new Date("2026-08-14T18:30:00.000Z");
      expect(toISTDateInputValue(istStart)).toBe("2026-08-15");

      // End of day in India
      const istEnd = new Date("2026-08-15T18:29:59.999Z");
      expect(toISTDateInputValue(istEnd)).toBe("2026-08-15");

      expect(toISTDateInputValue(undefined)).toBe("");
    });

    it("correctly identifies if two dates are in the same IST day", () => {
      const morning = new Date("2026-08-15T04:00:00.000Z"); // 09:30 AM IST
      const evening = new Date("2026-08-15T16:00:00.000Z"); // 09:30 PM IST
      const nextDayMorning = new Date("2026-08-16T04:00:00.000Z");

      expect(isSameISTDay(morning, evening)).toBe(true);
      expect(isSameISTDay(morning, nextDayMorning)).toBe(false);
      expect(isSameISTDay(morning, undefined)).toBe(false);
    });
  });
});

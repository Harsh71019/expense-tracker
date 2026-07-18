import { describe, expect, it } from "vitest";

import { parseTransactionFilters, serializeTransactionFilters } from "./filters";

const accountId = "507f1f77bcf86cd799439011";
const categoryId = "507f1f77bcf86cd799439012";

describe("transaction URL filters", () => {
  it("parses valid route state into the shared list-query contract", () => {
    expect(
      parseTransactionFilters({
        accountId,
        categoryId,
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-16T00:00:00.000Z",
        q: "groceries",
        cursor: "2026-07-10T00:00:00.000Z_507f1f77bcf86cd799439010",
        limit: "25"
      })
    ).toEqual({
      accountId,
      categoryId,
      from: new Date("2026-07-01T00:00:00.000Z"),
      to: new Date("2026-07-16T00:00:00.000Z"),
      q: "groceries",
      cursor: "2026-07-10T00:00:00.000Z_507f1f77bcf86cd799439010",
      limit: 25
    });
  });

  it("uses the first repeated value and keeps the documented default limit", () => {
    expect(parseTransactionFilters({ accountId: [accountId, "507f1f77bcf86cd799439013"] })).toEqual(
      { accountId, limit: 50 }
    );
  });

  it("fails closed for malformed URL state", () => {
    expect(parseTransactionFilters({ accountId: "not-an-object-id", limit: "1000" })).toEqual({
      limit: 50
    });
  });

  it("serializes filters in canonical order and omits the default limit", () => {
    expect(
      serializeTransactionFilters({
        accountId,
        categoryId,
        from: new Date("2026-07-01T00:00:00.000Z"),
        to: new Date("2026-07-16T00:00:00.000Z"),
        q: "groceries & household",
        cursor: "cursor-1",
        limit: 50
      })
    ).toBe(
      "accountId=507f1f77bcf86cd799439011&categoryId=507f1f77bcf86cd799439012&from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-16T00%3A00%3A00.000Z&q=groceries+%26+household&cursor=cursor-1"
    );
  });

  it("includes a non-default page size", () => {
    expect(serializeTransactionFilters({ accountId, limit: 25 })).toBe(
      "accountId=507f1f77bcf86cd799439011&limit=25"
    );
  });
});

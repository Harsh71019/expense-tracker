import { describe, expect, it } from "vitest";

import { parseTransactionFilters, serializeTransactionFilters } from "./filters";

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
      limit: 25
    });
  });

  it("uses the first repeated value and keeps the documented default limit", () => {
    expect(
      parseTransactionFilters({ accountId: [accountId, "3fa85f64-5717-4562-b3fc-2c963f66bef0"] })
    ).toEqual({ accountId, limit: 50 });
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
        tag: "goal:laptop",
        cursor: "cursor-1",
        limit: 50
      })
    ).toBe(
      "accountId=3fa85f64-5717-4562-b3fc-2c963f66beef&categoryId=3fa85f64-5717-4562-b3fc-2c963f66beff&from=2026-07-01T00%3A00%3A00.000Z&to=2026-07-16T00%3A00%3A00.000Z&q=groceries+%26+household&tag=goal%3Alaptop&cursor=cursor-1"
    );
  });

  it("round-trips the uncategorized filter", () => {
    expect(parseTransactionFilters({ uncategorized: "true" })).toEqual({
      uncategorized: true,
      limit: 50
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
});

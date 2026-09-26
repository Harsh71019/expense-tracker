import { describe, expect, it } from "vitest";

import { ExportCsvQuerySchema } from "./export.js";

describe("ExportCsvQuerySchema", () => {
  it("parses the complete transaction filter set without pagination", () => {
    expect(
      ExportCsvQuerySchema.parse({
        accountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
        uncategorized: "true",
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-31T23:59:59.999Z",
        minAmountMinor: "5000",
        maxAmountMinor: "20000",
        sort: "amount_desc",
        q: "rent",
        tag: "home"
      })
    ).toEqual({
      accountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
      uncategorized: true,
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.999Z"),
      minAmountMinor: 5000,
      maxAmountMinor: 20000,
      sort: "amount_desc",
      q: "rent",
      tag: "home"
    });
  });

  it("preserves transaction filter conflict validation", () => {
    expect(() =>
      ExportCsvQuerySchema.parse({
        categoryId: "3fa85f64-5717-4562-b3fc-2c963f66be00",
        uncategorized: "true"
      })
    ).toThrow("Category and uncategorized filters cannot be used together.");
    expect(() =>
      ExportCsvQuerySchema.parse({ amountMinor: "10000", minAmountMinor: "5000" })
    ).toThrow("Exact amount cannot be combined with minimum or maximum amount filters.");
  });
});

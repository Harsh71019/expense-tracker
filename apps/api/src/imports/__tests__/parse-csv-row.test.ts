import type { ColumnMapping } from "@vyaya/shared";
import { describe, expect, it } from "vitest";

import { parseCsvRow } from "../parse-csv-row.js";

const HDFC_MAPPING: ColumnMapping = {
  date: "Txn Date",
  description: "Narration",
  amount: "Amount",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "single_signed"
};

describe("parseCsvRow", () => {
  it("parses a clean row with no problems", () => {
    const result = parseCsvRow(
      { "Txn Date": "04/07/2026", Narration: "Chai Point", Amount: "-20.00" },
      HDFC_MAPPING
    );

    expect(result.problems).toEqual([]);
    expect(result.parsed).toEqual({
      occurredAt: new Date("2026-07-04T00:00:00.000Z"),
      amountMinor: 2_000,
      type: "expense",
      description: "Chai Point"
    });
  });

  it("collects problems from every failing field rather than stopping at the first", () => {
    const result = parseCsvRow(
      { "Txn Date": "31/02/2026", Narration: "", Amount: "not-a-number" },
      HDFC_MAPPING
    );

    expect(result.parsed).toBeUndefined();
    expect(result.problems).toHaveLength(3);
  });

  it("flags a missing date column value", () => {
    const result = parseCsvRow(
      { "Txn Date": "", Narration: "Chai", Amount: "-20.00" },
      HDFC_MAPPING
    );
    expect(result.parsed).toBeUndefined();
    expect(result.problems).toHaveLength(1);
  });

  it("never throws — a malformed row degrades to problems, not an exception", () => {
    expect(() => parseCsvRow({}, HDFC_MAPPING)).not.toThrow();
  });
});

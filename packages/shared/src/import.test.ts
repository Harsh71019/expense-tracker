import { describe, expect, it } from "vitest";

import { COLUMN_MAPPING_PRESETS, ColumnMappingSchema } from "./import.js";

describe("COLUMN_MAPPING_PRESETS", () => {
  it("every preset is a valid ColumnMapping", () => {
    for (const [name, preset] of Object.entries(COLUMN_MAPPING_PRESETS)) {
      expect(() => ColumnMappingSchema.parse(preset), name).not.toThrow();
    }
  });

  it("has an hdfc and an icici preset", () => {
    expect(Object.keys(COLUMN_MAPPING_PRESETS).sort()).toEqual(["hdfc", "icici"]);
  });
});

describe("ColumnMappingSchema", () => {
  it("requires an amount column for single_signed", () => {
    expect(() =>
      ColumnMappingSchema.parse({
        date: "Date",
        description: "Narration",
        dateFormat: "DD/MM/YYYY",
        amountConvention: "single_signed"
      })
    ).toThrow();
  });

  it("requires both debit and credit columns for debit_credit_cols", () => {
    expect(() =>
      ColumnMappingSchema.parse({
        date: "Date",
        description: "Narration",
        dateFormat: "DD/MM/YYYY",
        amountConvention: "debit_credit_cols",
        debit: "Withdrawal"
      })
    ).toThrow();
  });
});

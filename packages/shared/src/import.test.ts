import { describe, expect, it } from "vitest";

import { COLUMN_MAPPING_PRESETS, ColumnMappingSchema, StagedRowSchema } from "./import.js";

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

describe("StagedRowSchema category suggestions", () => {
  it("keeps editable selection separate from immutable suggestion provenance", () => {
    const row = StagedRowSchema.parse({
      id: "123e4567-e89b-42d3-a456-426614174010",
      batchId: "123e4567-e89b-42d3-a456-426614174011",
      rowNumber: 1,
      raw: {},
      suggestedCategoryId: "123e4567-e89b-42d3-a456-426614174002",
      categorySuggestion: {
        categoryId: "123e4567-e89b-42d3-a456-426614174001",
        confidenceBps: 8_500,
        method: "jaro_winkler",
        evidenceCount: 3,
        algorithmVersion: 1
      },
      problems: [],
      isDuplicate: false,
      include: true
    });
    expect(row.suggestedCategoryId).not.toBe(row.categorySuggestion?.categoryId);
  });
});

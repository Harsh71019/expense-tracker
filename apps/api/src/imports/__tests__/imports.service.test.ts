import { describe, expect, it } from "vitest";

import { InvalidImportFileError } from "../../common/errors/invalid-import-file.error.js";
import { assertValidImportFile } from "../imports.service.js";

const VALID_CSV = Buffer.from("Txn Date,Narration,Amount\n04/07/2026,Chai Point,-20.00\n", "utf8");

describe("assertValidImportFile", () => {
  it("accepts a well-formed .csv upload", () => {
    expect(() => assertValidImportFile("statement.csv", "text/csv", VALID_CSV)).not.toThrow();
  });

  it("rejects a non-.csv extension", () => {
    expect(() => assertValidImportFile("statement.xlsx", "text/csv", VALID_CSV)).toThrow(
      InvalidImportFileError
    );
  });

  it("rejects an unrecognized MIME type", () => {
    expect(() => assertValidImportFile("statement.csv", "application/pdf", VALID_CSV)).toThrow(
      InvalidImportFileError
    );
  });

  it("rejects an empty file", () => {
    expect(() => assertValidImportFile("statement.csv", "text/csv", Buffer.alloc(0))).toThrow(
      InvalidImportFileError
    );
  });

  it("rejects a file over the 5MB cap", () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, "a");
    expect(() => assertValidImportFile("statement.csv", "text/csv", oversized)).toThrow(
      InvalidImportFileError
    );
  });

  it("rejects a file whose approximate row count exceeds the 50k cap", () => {
    const header = "Txn Date,Narration,Amount\n";
    const row = "04/07/2026,Chai Point,-20.00\n";
    const tooManyRows = Buffer.from(header + row.repeat(50_001), "utf8");
    expect(() => assertValidImportFile("statement.csv", "text/csv", tooManyRows)).toThrow(
      InvalidImportFileError
    );
  });

  it("accepts a file right at the row cap", () => {
    const header = "Txn Date,Narration,Amount\n";
    const row = "04/07/2026,Chai Point,-20.00\n";
    const atCap = Buffer.from(header + row.repeat(50_000), "utf8");
    expect(() => assertValidImportFile("statement.csv", "text/csv", atCap)).not.toThrow();
  });
});

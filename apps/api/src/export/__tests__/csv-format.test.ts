import { describe, expect, it } from "vitest";

import { neutralizeFormulaInjection, toCsvDocument, toCsvRow } from "../csv-format.js";

describe("neutralizeFormulaInjection", () => {
  it("prefixes a cell starting with =, +, -, or @ with a single quote", () => {
    expect(neutralizeFormulaInjection("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(neutralizeFormulaInjection("+1+1")).toBe("'+1+1");
    expect(neutralizeFormulaInjection("-20.00")).toBe("'-20.00");
    expect(neutralizeFormulaInjection("@cmd")).toBe("'@cmd");
  });

  it("leaves an ordinary cell untouched", () => {
    expect(neutralizeFormulaInjection("Chai Point")).toBe("Chai Point");
    expect(neutralizeFormulaInjection("20.00")).toBe("20.00");
  });
});

describe("toCsvRow", () => {
  it("quotes a cell containing a comma", () => {
    expect(toCsvRow(["Rent, October", "5000"])).toBe('"Rent, October",5000');
  });

  it("escapes embedded quotes by doubling them", () => {
    expect(toCsvRow(['He said "hi"'])).toBe('"He said ""hi"""');
  });

  it("neutralizes before quoting, so a comma-containing formula gets both", () => {
    expect(toCsvRow([neutralizeFormulaInjection("=1,2")])).toBe('"\'=1,2"');
  });
});

describe("toCsvDocument", () => {
  it("joins rows with CRLF and ends with a trailing CRLF", () => {
    expect(
      toCsvDocument([
        ["a", "b"],
        ["c", "d"]
      ])
    ).toBe("a,b\r\nc,d\r\n");
  });
});

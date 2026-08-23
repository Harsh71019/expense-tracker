import { describe, expect, it } from "vitest";

import { KfintechCamsCurrentHoldingsParser } from "../kfintech-cams-current-holdings-parser.js";

const SANITIZED_CAS_TEXT = `
KFINTECH CAMS
Consolidated Account Statement
PORTFOLIO SUMMARY
Date Transaction Amount Units Price Unit Balance
Example Mutual Fund
EXAMPLE-Example Equity Fund - Direct Plan - Growth (Non-Demat) (Advisor:EXAMPLE) - ISIN:INF000000001
Folio No : 12345678
Opening Unit Balance 1,000.000
05-Aug-2026 Systematic Investment 1,000.00 4.000000 250.000000 1,004.000000
Closing Unit Balance: 1,004.000000 NAV on 05-Aug-2026 : INR 250.000000 Market Value on 05-Aug-2026 : INR 2,51,000.00 Total Cost Value : INR 2,00,000.00
EXAMPLE-Example Equity Fund - Direct Plan - Growth (Demat) (Advisor:EXAMPLE) - ISIN:INF000000001
Folio No : 87654321
Opening Unit Balance 6.000
*** No transactions during this statement period ***
Closing Unit Balance: 6.000 NAV on 05-Aug-2026 : INR 250.000000 Market Value on 05-Aug-2026 : INR 1,500.00 Total Cost Value : INR 1,200.00
Example Balanced Fund - Direct Plan - Growth
(Advisor:EXAMPLE) - ISIN:INF000000002
Folio No : 11223344
Opening Unit Balance 20.000
*** No transactions during this statement period ***
Closing Unit Balance: 20.000 NAV on 05-Aug-2026 : INR 100.500000 Market Value on 05-Aug-2026 : INR 2,010.00 Total Cost Value : INR 1,900.00
`;

describe("KfintechCamsCurrentHoldingsParser", () => {
  it("stages one cumulative current holding per ISIN and ignores SIP history", () => {
    const parser = new KfintechCamsCurrentHoldingsParser();

    expect(parser.supports(SANITIZED_CAS_TEXT)).toBe(true);
    expect(parser.parse(SANITIZED_CAS_TEXT)).toEqual([
      {
        rowKind: "holding",
        displayName: "EXAMPLE-Example Equity Fund - Direct Plan - Growth",
        folioReferenceMasked: "****5678, ****4321",
        isin: "INF000000001",
        occurredAt: new Date("2026-08-05T00:00:00.000Z"),
        quantityMicroUnits: 1_010_000_000,
        navMicroRupeesPerUnit: 250_000_000,
        grossAmountMinor: 25_250_000,
        proposedAction: "reconcile"
      },
      {
        rowKind: "holding",
        displayName: "Example Balanced Fund - Direct Plan - Growth",
        folioReferenceMasked: "****3344",
        isin: "INF000000002",
        occurredAt: new Date("2026-08-05T00:00:00.000Z"),
        quantityMicroUnits: 20_000_000,
        navMicroRupeesPerUnit: 100_500_000,
        grossAmountMinor: 201_000,
        proposedAction: "reconcile"
      }
    ]);
  });

  it("rejects mismatched scheme, folio, and closing-position counts", () => {
    const parser = new KfintechCamsCurrentHoldingsParser();
    const withoutLastClosing = SANITIZED_CAS_TEXT.replace(/Closing Unit Balance: 20\.000.*$/mu, "");

    expect(() => parser.parse(withoutLastClosing)).toThrow(
      "CAS scheme, folio, and closing-position counts do not match"
    );
  });

  it("rejects a document without every required layout marker", () => {
    const parser = new KfintechCamsCurrentHoldingsParser();

    expect(parser.supports("KFINTECH CAMS Consolidated Account Statement")).toBe(false);
    expect(() => parser.parse("not a CAS")).toThrow("Unsupported KFintech/CAMS CAS layout");
  });
});

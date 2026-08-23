import { describe, expect, it } from "vitest";

import { KfintechCamsCasParser } from "../kfintech-cams-cas-parser.js";

const SANITIZED_CAS_TEXT = `
KFINTECH CAMS
Consolidated Account Statement
PORTFOLIO SUMMARY
Date Transaction Amount Units Price Unit Balance
Example Mutual Fund
Folio No : 12345678
Example Equity Fund - Direct Plan - Growth (Advisor:INZ000) - ISIN:INF000000001
Opening Unit Balance 0.000
05-Aug-2026 Systematic Investment 1,000.00 4.000000 250.000000 4.000000
05-Aug-2026 *** Stamp Duty *** 0.05
Closing Unit Balance: 4.000000 NAV on 05-Aug-2026
`;

describe("KfintechCamsCasParser", () => {
  it("extracts only normalized transaction and holding facts from the supported layout", () => {
    const parser = new KfintechCamsCasParser();

    expect(parser.supports(SANITIZED_CAS_TEXT)).toBe(true);
    expect(parser.parse(SANITIZED_CAS_TEXT)).toEqual([
      {
        rowKind: "transaction",
        displayName: "Example Equity Fund - Direct Plan - Growth",
        folioReferenceMasked: "****5678",
        isin: "INF000000001",
        transactionType: "purchase",
        occurredAt: new Date("2026-08-05T00:00:00.000Z"),
        quantityMicroUnits: 4_000_000,
        grossAmountMinor: 100_000,
        navMicroRupeesPerUnit: 250_000_000,
        proposedAction: "append_event"
      },
      {
        rowKind: "holding",
        displayName: "Example Equity Fund - Direct Plan - Growth",
        folioReferenceMasked: "****5678",
        isin: "INF000000001",
        quantityMicroUnits: 4_000_000,
        proposedAction: "reconcile"
      }
    ]);
  });

  it("rejects a document without every required layout marker", () => {
    const parser = new KfintechCamsCasParser();

    expect(parser.supports("KFINTECH CAMS Consolidated Account Statement")).toBe(false);
    expect(() => parser.parse("not a CAS")).toThrow("Unsupported KFintech/CAMS CAS layout");
  });
});

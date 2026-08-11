import { describe, expect, it } from "vitest";

import { NormalizedTransactionTextSchema } from "./transaction-text.js";

describe("NormalizedTransactionTextSchema", () => {
  it("accepts the complete versioned derived-text contract", () => {
    expect(
      NormalizedTransactionTextSchema.parse({
        normalized: "swiggy ltd",
        counterpartyKey: "swiggy ltd",
        paymentRail: "upi",
        counterpartyHandle: "swiggy@ybl",
        directionHint: "debit",
        isFeeHint: false,
        isRefundHint: false,
        tokens: ["ltd", "swiggy"],
        referenceTokens: [{ kind: "rrn", value: "418923456789" }],
        normalizerVersion: 1
      })
    ).toMatchObject({ paymentRail: "upi", normalizerVersion: 1 });
  });

  it("rejects unversioned or unsupported output", () => {
    expect(() =>
      NormalizedTransactionTextSchema.parse({
        normalized: "merchant",
        counterpartyKey: "merchant",
        paymentRail: "cash",
        counterpartyHandle: null,
        directionHint: "unknown",
        isFeeHint: false,
        isRefundHint: false,
        tokens: ["merchant"],
        referenceTokens: [],
        normalizerVersion: 0
      })
    ).toThrow();
  });

  it("accepts RTGS as a supported payment rail", () => {
    expect(
      NormalizedTransactionTextSchema.parse({
        normalized: "acme rentals",
        counterpartyKey: "acme rentals",
        paymentRail: "rtgs",
        counterpartyHandle: null,
        directionHint: "debit",
        isFeeHint: false,
        isRefundHint: false,
        tokens: ["acme", "rentals"],
        referenceTokens: [{ kind: "utr", value: "hdfc0000000001" }],
        normalizerVersion: 1
      })
    ).toMatchObject({ paymentRail: "rtgs" });
  });
});

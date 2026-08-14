import { NormalizedTransactionTextSchema } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  normalizeTransactionText,
  TRANSACTION_TEXT_NORMALIZER_VERSION
} from "../normalize-transaction-text.js";

describe("normalizeTransactionText", () => {
  it("normalizes the documented UPI P2M example without retaining changing references", () => {
    expect(normalizeTransactionText("UPI/P2M/418923456789/SWIGGY LTD/order 44")).toEqual({
      normalized: "swiggy ltd",
      counterpartyKey: "swiggy ltd",
      paymentRail: "upi",
      counterpartyHandle: null,
      directionHint: "unknown",
      isFeeHint: false,
      isRefundHint: false,
      tokens: ["ltd", "swiggy"],
      referenceTokens: [
        { kind: "rrn", value: "418923456789" },
        { kind: "order", value: "44" }
      ],
      normalizerVersion: TRANSACTION_TEXT_NORMALIZER_VERSION
    });
  });

  it("applies NFKC, lowercase, and whitespace normalization", () => {
    const result = normalizeTransactionText("  ＵＰＩ／ＤＲ／418923456789／ＣＡＦÉ   ＳＨＯＰ  ");
    expect(result).toMatchObject({
      normalized: "café shop",
      counterpartyKey: "café shop",
      paymentRail: "upi",
      directionHint: "debit",
      tokens: ["café", "shop"]
    });
  });

  describe("synthetic Indian bank layouts", () => {
    it("extracts an HDFC-style UPI VPA and keeps the personal counterparty clue", () => {
      const result = normalizeTransactionText("UPI-DR-418923456789-JOHN DOE-john.doe@okhdfcbank");
      expect(result).toMatchObject({
        counterpartyKey: "john doe",
        paymentRail: "upi",
        counterpartyHandle: "john.doe@okhdfcbank",
        directionHint: "debit",
        referenceTokens: [{ kind: "rrn", value: "418923456789" }]
      });
    });

    it("extracts a labeled NEFT UTR without treating it as counterparty identity", () => {
      const result = normalizeTransactionText("NEFT/DR/UTR:HDFC1234567890/ACME RENTALS");
      expect(result).toMatchObject({
        counterpartyKey: "acme rentals",
        paymentRail: "neft",
        counterpartyHandle: null,
        directionHint: "debit",
        referenceTokens: [{ kind: "utr", value: "hdfc1234567890" }]
      });
    });

    it("extracts an IMPS reference and credit hint conservatively", () => {
      const result = normalizeTransactionText("IMPS/CR/REF 123456789012/PRIYA SHAH");
      expect(result).toMatchObject({
        counterpartyKey: "priya shah",
        paymentRail: "imps",
        directionHint: "credit",
        referenceTokens: [{ kind: "other", value: "123456789012" }]
      });
    });

    it("detects RTGS and extracts a labeled UTR conservatively", () => {
      const result = normalizeTransactionText("RTGS/DR/UTR:HDFC0000000001/ACME RENTALS");
      expect(result).toMatchObject({
        counterpartyKey: "acme rentals",
        paymentRail: "rtgs",
        counterpartyHandle: null,
        directionHint: "debit",
        referenceTokens: [{ kind: "utr", value: "hdfc0000000001" }]
      });
    });

    it("preserves the NACH payee while separating the mandate reference", () => {
      const result = normalizeTransactionText("NACH/DR/MANDATE ABC123/NETFLIX INDIA");
      expect(result).toMatchObject({
        counterpartyKey: "netflix india",
        paymentRail: "nach",
        directionHint: "debit",
        referenceTokens: [{ kind: "other", value: "abc123" }]
      });
    });

    it("removes card-channel noise from a POS narration", () => {
      const result = normalizeTransactionText("POS/VISA/DR/AMAZON/123456");
      expect(result).toMatchObject({
        counterpartyKey: "amazon",
        paymentRail: "card",
        directionHint: "debit"
      });
    });

    it("separates an HDFC e-mandate reference from the merchant", () => {
      const result = normalizeTransactionText("CARD/DR/EMANDATE/OpenAILLC/mandate:testMandate123");
      expect(result).toMatchObject({
        counterpartyKey: "openaillc",
        paymentRail: "card",
        directionHint: "debit",
        referenceTokens: [{ kind: "other", value: "testmandate123" }]
      });
    });
  });

  it("detects fee and refund hints without inferring transaction type", () => {
    expect(normalizeTransactionText("CARD/CR/REFUND/AMAZON")).toMatchObject({
      counterpartyKey: "amazon",
      paymentRail: "card",
      directionHint: "credit",
      isFeeHint: false,
      isRefundHint: true
    });
    expect(normalizeTransactionText("CARD ANNUAL FEE CHARGE")).toMatchObject({
      paymentRail: "card",
      directionHint: "unknown",
      isFeeHint: true,
      isRefundHint: false
    });
    expect(normalizeTransactionText("CREDIT CARD ANNUAL FEE")).toMatchObject({
      paymentRail: "card",
      directionHint: "unknown",
      isFeeHint: true
    });
  });

  it("abstains when rail or direction markers conflict", () => {
    expect(normalizeTransactionText("UPI NEFT DR CR TRANSFER")).toMatchObject({
      paymentRail: "unknown",
      directionHint: "unknown"
    });
    expect(normalizeTransactionText("RTGS NEFT DR TRANSFER")).toMatchObject({
      paymentRail: "unknown",
      directionHint: "debit"
    });
  });

  it("uses unambiguous bare direction words outside card descriptions", () => {
    expect(normalizeTransactionText("DEBIT rent")).toMatchObject({ directionHint: "debit" });
    expect(normalizeTransactionText("CREDIT salary")).toMatchObject({ directionHint: "credit" });
  });

  it("prefers the UPI RRN classification over a generic reference label", () => {
    expect(normalizeTransactionText("UPI/REF 418923456789/SWIGGY").referenceTokens).toEqual([
      { kind: "rrn", value: "418923456789" }
    ]);
  });

  it("does not match channel names embedded inside ordinary words", () => {
    expect(normalizeTransactionText("Impossible rent payment")).toMatchObject({
      normalized: "impossible rent",
      paymentRail: "unknown"
    });
  });

  it("does not treat an email address as a VPA without an explicit UPI marker", () => {
    expect(normalizeTransactionText("Receipt from alice@example.com")).toMatchObject({
      paymentRail: "unknown",
      counterpartyHandle: null
    });
  });

  it("preserves Unicode counterparty clues in the generic fallback", () => {
    expect(normalizeTransactionText("Café किराना दुकान")).toMatchObject({
      normalized: "café किराना दुकान",
      counterpartyKey: "café किराना दुकान",
      paymentRail: "unknown",
      tokens: ["café", "किराना", "दुकान"]
    });
  });

  it("preserves short numbers that are part of a counterparty name", () => {
    expect(normalizeTransactionText("24 SEVEN convenience store")).toMatchObject({
      normalized: "24 seven convenience store",
      counterpartyKey: "24 seven convenience store",
      tokens: ["24", "convenience", "seven", "store"]
    });
  });

  it("returns an empty but schema-valid result for transport-only input", () => {
    const result = normalizeTransactionText("  UPI / DR / 418923456789  ");
    expect(result).toMatchObject({
      normalized: "",
      counterpartyKey: null,
      paymentRail: "upi",
      directionHint: "debit",
      tokens: []
    });
    expect(NormalizedTransactionTextSchema.safeParse(result).success).toBe(true);
  });

  it("handles an empty narration", () => {
    expect(normalizeTransactionText("")).toMatchObject({
      normalized: "",
      counterpartyKey: null,
      paymentRail: "unknown",
      directionHint: "unknown",
      tokens: [],
      referenceTokens: []
    });
  });
});

import { describe, expect, it } from "vitest";

import { CreateAssetSchema } from "./asset.js";

describe("CreateAssetSchema", () => {
  it("accepts a fixed deposit with maturity and rate", () => {
    expect(
      CreateAssetSchema.parse({
        kind: "fixed_deposit",
        name: "HDFC FD",
        openedAt: "2026-01-01T00:00:00.000Z",
        maturityAt: "2027-01-01T00:00:00.000Z",
        annualRateBps: 650,
        openingValueMinor: 100_000_00
      })
    ).toMatchObject({ kind: "fixed_deposit", annualRateBps: 650 });
  });

  it("rejects maturityAt on a non-fixed-deposit asset", () => {
    expect(() =>
      CreateAssetSchema.parse({
        kind: "gold",
        name: "Gold coins",
        openedAt: "2026-01-01T00:00:00.000Z",
        maturityAt: "2027-01-01T00:00:00.000Z",
        openingValueMinor: 50_000_00
      })
    ).toThrow();
  });

  it("rejects quantityMilliUnits on a non gold/silver asset", () => {
    expect(() =>
      CreateAssetSchema.parse({
        kind: "investment",
        name: "Mutual fund",
        openedAt: "2026-01-01T00:00:00.000Z",
        quantityMilliUnits: 1_000,
        openingValueMinor: 25_000_00
      })
    ).toThrow();
  });

  it("accepts a negative opening value only for a loan_liability", () => {
    expect(
      CreateAssetSchema.parse({
        kind: "loan_liability",
        name: "Personal loan",
        openedAt: "2026-01-01T00:00:00.000Z",
        openingValueMinor: -50_000_00
      })
    ).toMatchObject({ openingValueMinor: -50_000_00 });

    expect(() =>
      CreateAssetSchema.parse({
        kind: "loan_receivable",
        name: "Loan to a friend",
        openedAt: "2026-01-01T00:00:00.000Z",
        openingValueMinor: -50_000_00
      })
    ).toThrow();
  });
});

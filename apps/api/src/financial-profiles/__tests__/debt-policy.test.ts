import { HIGH_COST_DEBT_ANNUAL_RATE_BPS } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  highCostPolicy,
  toDeclaredDebt,
  type LinkedAssetFacts,
  type StoredDeclaredDebt
} from "../debt-policy.js";

const ASSET_ID = "22222222-2222-4222-8222-222222222222";

function stored(overrides: Partial<StoredDeclaredDebt> = {}): StoredDeclaredDebt {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-a",
    name: "Amex revolve",
    kind: "credit_card",
    declaredOutstandingMinor: 85_000_00,
    annualRateBps: 4_200,
    minimumPaymentMinor: null,
    linkedAssetId: null,
    status: "active",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    resolvedAt: null,
    ...overrides
  };
}

function asset(overrides: Partial<LinkedAssetFacts> = {}): LinkedAssetFacts {
  return {
    name: "Car loan",
    isClosed: false,
    latestValuationMinor: -3_50_000_00,
    latestValuationAt: new Date("2026-08-10T00:00:00.000Z"),
    ...overrides
  };
}

describe("toDeclaredDebt — declared amounts", () => {
  it("labels an unlinked declared amount as an estimate", () => {
    const debt = toDeclaredDebt(stored(), undefined);

    expect(debt).toMatchObject({
      outstandingMinor: 85_000_00,
      declaredOutstandingMinor: 85_000_00,
      amountSource: "declared",
      isEstimate: true,
      linkedAssetId: null,
      linkedAssetName: null,
      valuationAsOf: null
    });
  });
});

describe("toDeclaredDebt — linked loan liabilities", () => {
  it("derives the outstanding amount from the absolute value of the latest valuation", () => {
    const debt = toDeclaredDebt(
      stored({ linkedAssetId: ASSET_ID, declaredOutstandingMinor: null, kind: "consumer_loan" }),
      asset()
    );

    expect(debt).toMatchObject({
      outstandingMinor: 3_50_000_00,
      declaredOutstandingMinor: null,
      amountSource: "linked_asset",
      isEstimate: false,
      linkedAssetName: "Car loan",
      valuationAsOf: new Date("2026-08-10T00:00:00.000Z")
    });
  });

  it("handles a positively signed valuation identically — magnitude is what is owed", () => {
    const debt = toDeclaredDebt(
      stored({ linkedAssetId: ASSET_ID, declaredOutstandingMinor: null }),
      asset({ latestValuationMinor: 3_50_000_00 })
    );

    expect(debt.outstandingMinor).toBe(3_50_000_00);
  });

  it("reports a missing valuation as null rather than as zero owed", () => {
    const debt = toDeclaredDebt(
      stored({ linkedAssetId: ASSET_ID, declaredOutstandingMinor: null }),
      asset({ latestValuationMinor: null, latestValuationAt: null })
    );

    expect(debt.outstandingMinor).toBeNull();
    expect(debt.valuationAsOf).toBeNull();
    expect(debt.amountSource).toBe("linked_asset");
  });

  it("reports a fully repaid (zero-valued) linked asset as an absent amount, not zero", () => {
    const debt = toDeclaredDebt(
      stored({ linkedAssetId: ASSET_ID, declaredOutstandingMinor: null }),
      asset({ latestValuationMinor: 0 })
    );

    expect(debt.outstandingMinor).toBeNull();
  });

  it("reports a vanished linked asset without inventing an amount or unlinking", () => {
    const debt = toDeclaredDebt(
      stored({ linkedAssetId: ASSET_ID, declaredOutstandingMinor: null }),
      undefined
    );

    expect(debt).toMatchObject({
      linkedAssetId: ASSET_ID,
      linkedAssetName: null,
      outstandingMinor: null,
      valuationAsOf: null,
      amountSource: "linked_asset"
    });
  });

  it("keeps a stale valuation date visible instead of hiding it", () => {
    const debt = toDeclaredDebt(
      stored({ linkedAssetId: ASSET_ID, declaredOutstandingMinor: null }),
      asset({ latestValuationAt: new Date("2021-01-01T00:00:00.000Z") })
    );

    expect(debt.valuationAsOf).toEqual(new Date("2021-01-01T00:00:00.000Z"));
  });
});

describe("toDeclaredDebt — high-cost flag", () => {
  it("does not flag exactly 1200 bps", () => {
    expect(toDeclaredDebt(stored({ annualRateBps: 1_200 }), undefined).isHighCost).toBe(false);
  });

  it("flags 1201 bps", () => {
    expect(toDeclaredDebt(stored({ annualRateBps: 1_201 }), undefined).isHighCost).toBe(true);
  });

  it("flags a typical credit-card rate and not a typical home-loan rate", () => {
    expect(toDeclaredDebt(stored({ annualRateBps: 4_200 }), undefined).isHighCost).toBe(true);
    expect(toDeclaredDebt(stored({ annualRateBps: 850 }), undefined).isHighCost).toBe(false);
  });
});

describe("toDeclaredDebt — resolution", () => {
  it("carries the resolved status and timestamp through untouched", () => {
    const resolvedAt = new Date("2026-08-20T00:00:00.000Z");
    const debt = toDeclaredDebt(stored({ status: "resolved", resolvedAt }), undefined);

    expect(debt).toMatchObject({ status: "resolved", resolvedAt });
  });
});

describe("highCostPolicy", () => {
  it("publishes the threshold and the strictly-greater-than comparison", () => {
    expect(highCostPolicy(2)).toEqual({
      thresholdBps: HIGH_COST_DEBT_ANNUAL_RATE_BPS,
      comparison: "greater_than",
      highCostCount: 2
    });
  });
});

import { describe, expect, it } from "vitest";

import { CreateMarketLinkedAssetSchema } from "./market-linked-asset.js";

const input = {
  asset: {
    kind: "investment",
    name: "Index fund",
    openedAt: "2026-08-23T00:00:00.000Z",
    openingValueMinor: 10_000
  },
  marketLink: {
    instrumentType: "mutual_fund",
    provider: "amfi",
    providerInstrumentId: "120503",
    quoteUnit: "fund_unit",
    effectiveFrom: "2026-08-23T00:00:00.000Z"
  },
  openingPosition: {
    eventType: "opening",
    quantityMicroUnits: 1_000_000,
    occurredAt: "2026-08-23T00:00:00.000Z"
  }
};

describe("market-linked asset contracts", () => {
  it("accepts an investment with its instrument, valuation, and opening position", () => {
    expect(CreateMarketLinkedAssetSchema.parse(input)).toMatchObject({
      asset: { kind: "investment" },
      openingPosition: { eventType: "opening" }
    });
  });

  it("rejects an incompatible asset, instrument, or opening event", () => {
    expect(
      CreateMarketLinkedAssetSchema.safeParse({
        ...input,
        asset: { ...input.asset, kind: "gold" },
        marketLink: { ...input.marketLink, instrumentType: "physical_silver", quoteUnit: "gram" }
      }).success
    ).toBe(false);
    expect(
      CreateMarketLinkedAssetSchema.safeParse({
        ...input,
        openingPosition: { ...input.openingPosition, eventType: "purchase" }
      }).success
    ).toBe(false);
  });

  it("requires physical-metal opening quantities to fit the legacy cache exactly", () => {
    const physical = {
      ...input,
      asset: { ...input.asset, kind: "gold" },
      marketLink: {
        ...input.marketLink,
        instrumentType: "physical_gold",
        provider: "manual",
        providerInstrumentId: "24k",
        quoteUnit: "gram"
      },
      openingPosition: { ...input.openingPosition, quantityMicroUnits: 1_001 }
    };
    expect(CreateMarketLinkedAssetSchema.safeParse(physical).success).toBe(false);
  });
});

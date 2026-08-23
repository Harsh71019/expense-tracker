import { describe, expect, it } from "vitest";

import {
  CreateAssetMarketLinkSchema,
  CreateAssetPositionEventSchema,
  CreateManualAssetPositionEventSchema
} from "./asset-market.js";

const ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";
const EVENT_ID = "223e4567-e89b-42d3-a456-426614174000";

describe("market asset contracts", () => {
  it("accepts a physical-metal link with gram quotes and optional purity", () => {
    expect(
      CreateAssetMarketLinkSchema.parse({
        assetId: ASSET_ID,
        instrumentType: "physical_gold",
        provider: "manual",
        providerInstrumentId: "24k",
        quoteUnit: "gram",
        purityBps: 9_167,
        effectiveFrom: "2026-08-23T00:00:00.000Z"
      })
    ).toMatchObject({ autoValuationEnabled: true, purityBps: 9_167 });
  });

  it.each([
    { instrumentType: "physical_gold", quoteUnit: "fund_unit", purityBps: 10_000 },
    { instrumentType: "mutual_fund", quoteUnit: "gram", purityBps: undefined },
    { instrumentType: "mutual_fund", quoteUnit: "fund_unit", purityBps: 9_999 }
  ])("rejects incompatible instrument metadata", (overrides) => {
    expect(
      CreateAssetMarketLinkSchema.safeParse({
        assetId: ASSET_ID,
        provider: "manual",
        providerInstrumentId: "instrument",
        effectiveFrom: "2026-08-23T00:00:00.000Z",
        ...overrides
      }).success
    ).toBe(false);
  });

  it("requires reversal linkage only for reversal position events", () => {
    const base = {
      assetId: ASSET_ID,
      quantityMicroUnits: 1_000_000,
      occurredAt: "2026-08-23T00:00:00.000Z",
      source: "manual",
      sourceReference: "manual:opening:1"
    };

    expect(
      CreateAssetPositionEventSchema.safeParse({ ...base, eventType: "reversal" }).success
    ).toBe(false);
    expect(
      CreateAssetPositionEventSchema.safeParse({
        ...base,
        eventType: "opening",
        reversalOf: EVENT_ID
      }).success
    ).toBe(false);
    expect(
      CreateAssetPositionEventSchema.safeParse({
        ...base,
        eventType: "reversal",
        reversalOf: EVENT_ID
      }).success
    ).toBe(true);
  });

  it("keeps reversal and import provenance fields out of manual event requests", () => {
    expect(
      CreateManualAssetPositionEventSchema.safeParse({
        eventType: "reversal",
        quantityMicroUnits: 1,
        occurredAt: "2026-08-23T00:00:00.000Z"
      }).success
    ).toBe(false);
    expect(
      CreateManualAssetPositionEventSchema.safeParse({
        eventType: "opening",
        quantityMicroUnits: 1,
        occurredAt: "2026-08-23T00:00:00.000Z",
        source: "cas"
      }).success
    ).toBe(true);
  });
});

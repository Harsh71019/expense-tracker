import { describe, expect, it } from "vitest";

import {
  CreateAssetMarketLinkRequestSchema,
  CreateAssetMarketLinkSchema,
  CreateAssetPositionEventSchema,
  CreateManualAssetPositionEventSchema,
  deriveAssetCurrentPosition,
  AssetPositionEventSchema
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

  it.each([
    null,
    1704067200000,
    "2026-08-23T00:00:00",
    "2026-08-23T00:00:00+05:30",
    "2026-08-23",
    "invalid-date"
  ])("rejects non-UTC and coerced timestamps in request schemas (%s)", (invalidDate) => {
    expect(
      CreateAssetMarketLinkRequestSchema.safeParse({
        instrumentType: "mutual_fund",
        provider: "amfi",
        providerInstrumentId: "120716",
        quoteUnit: "fund_unit",
        effectiveFrom: invalidDate
      }).success
    ).toBe(false);

    expect(
      CreateManualAssetPositionEventSchema.safeParse({
        eventType: "purchase",
        quantityMicroUnits: 1_000_000,
        occurredAt: invalidDate
      }).success
    ).toBe(false);
  });

  it("accepts valid ISO 8601 UTC timestamps ending in Z and transforms to Date", () => {
    const linkParsed = CreateAssetMarketLinkRequestSchema.parse({
      instrumentType: "mutual_fund",
      provider: "amfi",
      providerInstrumentId: "120716",
      quoteUnit: "fund_unit",
      effectiveFrom: "2026-08-23T10:00:00.000Z"
    });
    expect(linkParsed.effectiveFrom).toBeInstanceOf(Date);
    expect(linkParsed.effectiveFrom.toISOString()).toBe("2026-08-23T10:00:00.000Z");

    const eventParsed = CreateManualAssetPositionEventSchema.parse({
      eventType: "purchase",
      quantityMicroUnits: 1_000_000,
      occurredAt: "2026-08-23T10:00:00.000Z"
    });
    expect(eventParsed.occurredAt).toBeInstanceOf(Date);
    expect(eventParsed.occurredAt.toISOString()).toBe("2026-08-23T10:00:00.000Z");
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

  it("replays inbound, outbound, and reversal position events exactly", () => {
    const opening = AssetPositionEventSchema.parse({
      id: EVENT_ID,
      userId: "u1",
      assetId: ASSET_ID,
      eventType: "opening",
      quantityMicroUnits: 2_000_000,
      occurredAt: "2026-08-20T00:00:00.000Z",
      source: "manual",
      sourceReference: "manual:opening",
      createdAt: "2026-08-20T00:00:00.000Z"
    });
    const redemption = AssetPositionEventSchema.parse({
      id: "323e4567-e89b-42d3-a456-426614174000",
      userId: "u1",
      assetId: ASSET_ID,
      eventType: "redemption",
      quantityMicroUnits: 500_000,
      occurredAt: "2026-08-21T00:00:00.000Z",
      source: "manual",
      sourceReference: "manual:redemption",
      createdAt: "2026-08-21T00:00:00.000Z"
    });
    const reversal = AssetPositionEventSchema.parse({
      id: "423e4567-e89b-42d3-a456-426614174000",
      userId: "u1",
      assetId: ASSET_ID,
      eventType: "reversal",
      quantityMicroUnits: 500_000,
      occurredAt: "2026-08-22T00:00:00.000Z",
      source: "manual",
      sourceReference: "manual:redemption-reversal",
      reversalOf: redemption.id,
      createdAt: "2026-08-22T00:00:00.000Z"
    });
    expect(deriveAssetCurrentPosition(ASSET_ID, [opening, redemption, reversal])).toMatchObject({
      quantityMicroUnits: 2_000_000,
      eventCount: 3,
      asOf: new Date("2026-08-22T00:00:00.000Z")
    });
  });
});

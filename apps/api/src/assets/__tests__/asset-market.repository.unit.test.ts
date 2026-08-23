import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { AssetMarketRepository } from "../asset-market.repository.js";

const ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";
const LINK_ID = "223e4567-e89b-42d3-a456-426614174000";
const EVENT_ID = "323e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-08-23T00:00:00.000Z");

describe("AssetMarketRepository", () => {
  it("parses a created market-link revision from its database row", async () => {
    const mockDb = createMockDrizzleDb([
      {
        id: LINK_ID,
        userId: "u1",
        assetId: ASSET_ID,
        instrumentType: "mutual_fund",
        provider: "amfi",
        providerInstrumentId: "120503",
        isin: null,
        schemeCode: "120503",
        schemePlan: "direct",
        schemeOption: "growth",
        acquisitionChannel: null,
        quoteUnit: "fund_unit",
        purityBps: null,
        autoValuationEnabled: true,
        effectiveFrom: NOW,
        supersededAt: null,
        revisionOf: null,
        createdAt: NOW
      }
    ]);
    const repository = new AssetMarketRepository(mockDb);

    const link = await repository.createLink(
      "u1",
      {
        assetId: ASSET_ID,
        instrumentType: "mutual_fund",
        provider: "amfi",
        providerInstrumentId: "120503",
        schemeCode: "120503",
        schemePlan: "direct",
        schemeOption: "growth",
        quoteUnit: "fund_unit",
        autoValuationEnabled: true,
        effectiveFrom: NOW
      },
      // @ts-expect-error The fluent mock is structurally narrower than DbTx.
      mockDb
    );

    expect(link).toMatchObject({ id: LINK_ID, userId: "u1", schemeCode: "120503" });
  });

  it("parses an append-only position event from its database row", async () => {
    const mockDb = createMockDrizzleDb([
      {
        id: EVENT_ID,
        userId: "u1",
        assetId: ASSET_ID,
        eventType: "opening",
        quantityMicroUnits: 1_000_000,
        grossAmountMinor: null,
        chargesMinor: null,
        taxesAtAcquisitionMinor: null,
        occurredAt: NOW,
        transactionId: null,
        assetFundingId: null,
        source: "manual",
        sourceReference: "manual:opening:1",
        portfolioImportRowId: null,
        reversalOf: null,
        createdAt: NOW
      }
    ]);
    const repository = new AssetMarketRepository(mockDb);

    const event = await repository.createPositionEvent(
      "u1",
      {
        assetId: ASSET_ID,
        eventType: "opening",
        quantityMicroUnits: 1_000_000,
        occurredAt: NOW,
        source: "manual",
        sourceReference: "manual:opening:1"
      },
      // @ts-expect-error The fluent mock is structurally narrower than DbTx.
      mockDb
    );

    expect(event).toMatchObject({ id: EVENT_ID, userId: "u1", eventType: "opening" });
  });
});

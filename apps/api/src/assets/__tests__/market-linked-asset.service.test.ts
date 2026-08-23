import type { Asset, AssetMarketLink, AssetPositionEvent } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { MarketLinkedAssetService } from "../market-linked-asset.service.js";

const NOW = new Date("2026-08-23T00:00:00.000Z");
const ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";

const ASSET: Asset = {
  id: ASSET_ID,
  userId: "u1",
  kind: "gold",
  name: "24K gold",
  openedAt: NOW,
  quantityMilliUnits: 1_234,
  isClosed: false,
  createdAt: NOW,
  updatedAt: NOW
};

const LINK: AssetMarketLink = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  userId: "u1",
  assetId: ASSET_ID,
  instrumentType: "physical_gold",
  provider: "manual",
  providerInstrumentId: "24k",
  quoteUnit: "gram",
  autoValuationEnabled: true,
  effectiveFrom: NOW,
  createdAt: NOW
};

const OPENING_POSITION: AssetPositionEvent = {
  id: "323e4567-e89b-42d3-a456-426614174000",
  userId: "u1",
  assetId: ASSET_ID,
  eventType: "opening",
  quantityMicroUnits: 1_234_000,
  occurredAt: NOW,
  source: "manual",
  sourceReference: "market-linked-opening:key",
  createdAt: NOW
};

describe("MarketLinkedAssetService", () => {
  it("creates the asset, its active link, and its opening position in one supplied transaction", async () => {
    const assets = { createInTx: vi.fn().mockResolvedValue(ASSET) };
    const links = { setActiveInTx: vi.fn().mockResolvedValue(LINK) };
    const positions = { createManualInTx: vi.fn().mockResolvedValue(OPENING_POSITION) };
    const service = new MarketLinkedAssetService(
      focusedTestDouble(assets),
      focusedTestDouble(links),
      focusedTestDouble(positions)
    );
    const tx = {};

    await expect(
      service.createInTx(
        "u1",
        {
          asset: {
            kind: "gold",
            name: "24K gold",
            openedAt: NOW,
            openingValueMinor: 10_000
          },
          marketLink: {
            instrumentType: "physical_gold",
            provider: "manual",
            providerInstrumentId: "24k",
            quoteUnit: "gram",
            autoValuationEnabled: true,
            effectiveFrom: NOW
          },
          openingPosition: {
            eventType: "opening",
            quantityMicroUnits: 1_234_000,
            occurredAt: NOW
          }
        },
        "market-linked-opening:key",
        // @ts-expect-error Focused transaction double.
        tx
      )
    ).resolves.toEqual({ asset: ASSET, marketLink: LINK, openingPosition: OPENING_POSITION });
    expect(assets.createInTx).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ quantityMilliUnits: 1_234 }),
      tx
    );
    expect(links.setActiveInTx).toHaveBeenCalledWith(
      "u1",
      ASSET_ID,
      expect.objectContaining({ instrumentType: "physical_gold" }),
      tx
    );
    expect(positions.createManualInTx).toHaveBeenCalledWith(
      "u1",
      ASSET_ID,
      expect.objectContaining({ eventType: "opening" }),
      "market-linked-opening:key",
      tx
    );
  });
});

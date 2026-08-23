import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { AssetMarketController } from "../asset-market.controller.js";

const USER: AuthenticatedUser = { id: "u1" };
const ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";
const EVENT_ID = "223e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-08-23T00:00:00.000Z");

const LINK = {
  id: "323e4567-e89b-42d3-a456-426614174000",
  userId: USER.id,
  assetId: ASSET_ID,
  instrumentType: "mutual_fund" as const,
  provider: "amfi" as const,
  providerInstrumentId: "120503",
  quoteUnit: "fund_unit" as const,
  autoValuationEnabled: true,
  effectiveFrom: NOW,
  createdAt: NOW
};

const EVENT = {
  id: EVENT_ID,
  userId: USER.id,
  assetId: ASSET_ID,
  eventType: "opening" as const,
  quantityMicroUnits: 1_000_000,
  occurredAt: NOW,
  source: "manual" as const,
  sourceReference: "manual:key",
  createdAt: NOW
};

function response(): { status: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn> } {
  const result = { status: vi.fn(), setHeader: vi.fn() };
  result.status.mockReturnValue(result);
  return result;
}

describe("AssetMarketController", () => {
  it("sets a market link and returns its location", async () => {
    const mutations = {
      setMarketLink: vi.fn().mockResolvedValue({ result: LINK, replayed: false })
    };
    // @ts-expect-error Focused controller collaborators.
    const controller = new AssetMarketController({}, {}, mutations);
    const res = response();

    await expect(
      controller.setMarketLink(
        USER,
        ASSET_ID,
        {
          instrumentType: "mutual_fund",
          provider: "amfi",
          providerInstrumentId: "120503",
          quoteUnit: "fund_unit",
          effectiveFrom: NOW.toISOString()
        },
        "423e4567-e89b-42d3-a456-426614174000",
        // @ts-expect-error Focused response double.
        res
      )
    ).resolves.toEqual(LINK);
    expect(res.setHeader).toHaveBeenCalledWith(
      "Location",
      `/api/v1/assets/${ASSET_ID}/market-link`
    );
  });

  it("creates and reverses position events through idempotent mutations", async () => {
    const reversal = {
      original: EVENT,
      reversal: { ...EVENT, id: LINK.id, eventType: "reversal" as const, reversalOf: EVENT_ID }
    };
    const mutations = {
      createPositionEvent: vi.fn().mockResolvedValue({ result: EVENT, replayed: true }),
      reversePositionEvent: vi.fn().mockResolvedValue({ result: reversal, replayed: true })
    };
    // @ts-expect-error Focused controller collaborators.
    const controller = new AssetMarketController({}, {}, mutations);
    const res = response();

    await controller.createPositionEvent(
      USER,
      ASSET_ID,
      { eventType: "opening", quantityMicroUnits: 1_000_000, occurredAt: NOW.toISOString() },
      "523e4567-e89b-42d3-a456-426614174000",
      // @ts-expect-error Focused response double.
      res
    );
    await controller.reversePositionEvent(
      USER,
      ASSET_ID,
      EVENT_ID,
      "623e4567-e89b-42d3-a456-426614174000",
      // @ts-expect-error Focused response double.
      res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("lists position events and reads the active market link for the current user", async () => {
    const links = { getActive: vi.fn().mockResolvedValue(LINK) };
    const positions = {
      listByAsset: vi.fn().mockResolvedValue({
        items: [EVENT],
        pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
      })
    };
    // @ts-expect-error Focused controller collaborators.
    const controller = new AssetMarketController(links, positions, {});

    await expect(controller.getMarketLink(USER, ASSET_ID)).resolves.toEqual(LINK);
    await expect(
      controller.listPositionEvents(USER, ASSET_ID, { limit: "50" })
    ).resolves.toMatchObject({
      items: [EVENT]
    });
    expect(links.getActive).toHaveBeenCalledWith(USER.id, ASSET_ID);
    expect(positions.listByAsset).toHaveBeenCalledWith(USER.id, ASSET_ID, { limit: 50 });
  });
});

import type {
  Asset,
  AssetMarketLink,
  AssetPositionEvent,
  CreateAssetMarketLinkRequest
} from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import {
  AssetMarketLinkRequiredError,
  AssetPositionEventAlreadyReversedError
} from "../../common/errors/asset-market.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { AssetMarketLinkService } from "../asset-market-link.service.js";
import { AssetPositionService } from "../asset-position.service.js";

const ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";
const LINK_ID = "223e4567-e89b-42d3-a456-426614174000";
const EVENT_ID = "323e4567-e89b-42d3-a456-426614174000";
const REVERSAL_ID = "423e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-08-23T00:00:00.000Z");

const ASSET: Asset = {
  id: ASSET_ID,
  userId: "u1",
  kind: "investment",
  name: "Index fund",
  openedAt: NOW,
  isClosed: false,
  createdAt: NOW,
  updatedAt: NOW
};

const LINK: AssetMarketLink = {
  id: LINK_ID,
  userId: "u1",
  assetId: ASSET_ID,
  instrumentType: "mutual_fund",
  provider: "amfi",
  providerInstrumentId: "120503",
  quoteUnit: "fund_unit",
  autoValuationEnabled: true,
  effectiveFrom: NOW,
  createdAt: NOW
};

const EVENT: AssetPositionEvent = {
  id: EVENT_ID,
  userId: "u1",
  assetId: ASSET_ID,
  eventType: "purchase",
  quantityMicroUnits: 1_000_000,
  grossAmountMinor: 10_000,
  occurredAt: NOW,
  source: "manual",
  sourceReference: "manual:original",
  createdAt: NOW
};

const REVERSAL: AssetPositionEvent = {
  ...EVENT,
  id: REVERSAL_ID,
  eventType: "reversal",
  sourceReference: "manual-reversal:key-2",
  reversalOf: EVENT_ID
};

type Double = Readonly<Record<string, ReturnType<typeof vi.fn>>>;

function createPositionService(
  overrides: Readonly<{ assets?: Double; market?: Double; audit?: Double }> = {}
) {
  const collaborators = {
    assets: overrides.assets ?? {},
    market: overrides.market ?? {},
    audit: overrides.audit ?? { record: vi.fn().mockResolvedValue(undefined) }
  };
  return {
    service: new AssetPositionService(
      focusedTestDouble(collaborators.assets),
      focusedTestDouble(collaborators.market),
      focusedTestDouble(collaborators.audit)
    ),
    ...collaborators
  };
}

function createLinkService(
  overrides: Readonly<{ assets?: Double; market?: Double; audit?: Double }> = {}
) {
  const collaborators = {
    assets: overrides.assets ?? {},
    market: overrides.market ?? {},
    audit: overrides.audit ?? { record: vi.fn().mockResolvedValue(undefined) }
  };
  return {
    service: new AssetMarketLinkService(
      focusedTestDouble(collaborators.assets),
      focusedTestDouble(collaborators.market),
      focusedTestDouble(collaborators.audit)
    ),
    ...collaborators
  };
}

describe("AssetPositionService", () => {
  it("derives the current position by replaying all tenant-scoped events", async () => {
    const events = [EVENT];
    const context = createPositionService({
      assets: { findById: vi.fn().mockResolvedValue(ASSET) },
      market: { listAllPositionEventsByAsset: vi.fn().mockResolvedValue(events) }
    });

    await expect(context.service.getCurrentPosition("u1", ASSET_ID)).resolves.toMatchObject({
      assetId: ASSET_ID,
      quantityMicroUnits: 1_000_000,
      eventCount: 1
    });
    expect(context.market.listAllPositionEventsByAsset).toHaveBeenCalledWith("u1", ASSET_ID);
  });

  it("records a manual position event only after the asset has a market link", async () => {
    const market = {
      findActiveLinkByAssetIdForUpdate: vi.fn().mockResolvedValue(LINK),
      createPositionEvent: vi.fn().mockResolvedValue(EVENT)
    };
    const context = createPositionService({
      assets: { findOpenByIdForUpdate: vi.fn().mockResolvedValue(ASSET) },
      market
    });
    const tx = {};

    await expect(
      context.service.createManualInTx(
        "u1",
        ASSET_ID,
        {
          eventType: "purchase",
          quantityMicroUnits: 1_000_000,
          grossAmountMinor: 10_000,
          occurredAt: NOW
        },
        "manual:key-1",
        // @ts-expect-error Focused transaction double.
        tx
      )
    ).resolves.toEqual(EVENT);
    expect(market.createPositionEvent).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        assetId: ASSET_ID,
        source: "manual",
        sourceReference: "manual:key-1"
      }),
      tx
    );
  });

  it("rejects a manual position event before an asset has been linked", async () => {
    const context = createPositionService({
      assets: { findOpenByIdForUpdate: vi.fn().mockResolvedValue(ASSET) },
      market: { findActiveLinkByAssetIdForUpdate: vi.fn().mockResolvedValue(null) }
    });

    await expect(
      context.service.createManualInTx(
        "u1",
        ASSET_ID,
        { eventType: "opening", quantityMicroUnits: 1_000_000, occurredAt: NOW },
        "manual:key-1",
        // @ts-expect-error Focused transaction double.
        {}
      )
    ).rejects.toBeInstanceOf(AssetMarketLinkRequiredError);
  });

  it("appends one reversal and prevents a second reversal", async () => {
    const market = {
      findPositionEventByIdForUpdate: vi.fn().mockResolvedValue(EVENT),
      findReversalForPositionEvent: vi.fn().mockResolvedValue(null),
      createPositionEvent: vi.fn().mockResolvedValue(REVERSAL)
    };
    const context = createPositionService({
      assets: { findByIdForUpdate: vi.fn().mockResolvedValue(ASSET) },
      market
    });
    const tx = {};

    await expect(
      context.service.reverseInTx(
        "u1",
        ASSET_ID,
        EVENT_ID,
        "manual-reversal:key-2",
        // @ts-expect-error Focused transaction double.
        tx
      )
    ).resolves.toEqual({ original: EVENT, reversal: REVERSAL });
    expect(market.createPositionEvent).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        eventType: "reversal",
        quantityMicroUnits: EVENT.quantityMicroUnits,
        reversalOf: EVENT_ID
      }),
      tx
    );

    const alreadyReversed = createPositionService({
      assets: { findByIdForUpdate: vi.fn().mockResolvedValue(ASSET) },
      market: {
        findPositionEventByIdForUpdate: vi.fn().mockResolvedValue(EVENT),
        findReversalForPositionEvent: vi.fn().mockResolvedValue(REVERSAL)
      }
    });
    await expect(
      alreadyReversed.service.reverseInTx(
        "u1",
        ASSET_ID,
        EVENT_ID,
        "manual-reversal:key-3",
        // @ts-expect-error Focused transaction double.
        {}
      )
    ).rejects.toBeInstanceOf(AssetPositionEventAlreadyReversedError);
  });
});

describe("AssetMarketLinkService", () => {
  it("supersedes the active link and records a revision audit entry", async () => {
    const revised = { ...LINK, id: REVERSAL_ID, revisionOf: LINK_ID };
    const market = {
      findActiveLinkByAssetIdForUpdate: vi.fn().mockResolvedValue(LINK),
      supersedeActiveLink: vi.fn().mockResolvedValue(true),
      createLink: vi.fn().mockResolvedValue(revised)
    };
    const context = createLinkService({
      assets: { findOpenByIdForUpdate: vi.fn().mockResolvedValue(ASSET) },
      market
    });
    const input: CreateAssetMarketLinkRequest = {
      instrumentType: "mutual_fund",
      provider: "amfi",
      providerInstrumentId: "120504",
      quoteUnit: "fund_unit",
      autoValuationEnabled: true,
      effectiveFrom: NOW
    };
    const tx = {};

    await expect(
      context.service.setActiveInTx(
        "u1",
        ASSET_ID,
        input,
        // @ts-expect-error Focused transaction double.
        tx
      )
    ).resolves.toEqual(revised);
    expect(market.createLink).toHaveBeenCalledWith(
      "u1",
      { ...input, assetId: ASSET_ID, revisionOf: LINK_ID },
      tx
    );
    expect(context.audit.record).toHaveBeenCalledWith(
      "u1",
      "asset.market_link.revise",
      REVERSAL_ID,
      tx,
      { assetId: ASSET_ID, supersededLinkId: LINK_ID }
    );
  });
});

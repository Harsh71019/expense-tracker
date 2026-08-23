import { describe, expect, it, vi } from "vitest";
import type {
  Asset,
  AssetMarketLink,
  AssetPositionEvent,
  AssetCurrentPosition
} from "@treasury-ops/shared";

import { InsufficientDisposalContextError } from "../common/errors/asset-market.error.js";
import { focusedTestDouble } from "../test/mock-drizzle.js";
import { DisposalEstimateService } from "./disposal-estimate.service.js";
import type { AssetRepository } from "./asset.repository.js";
import type { AssetMarketRepository } from "./asset-market.repository.js";
import type { MarketQuoteRepository } from "./market-quote.repository.js";
import type { AssetPositionService } from "./asset-position.service.js";

describe("DisposalEstimateService", () => {
  const userId = "user-1";
  const assetId = "00000000-0000-0000-0000-000000000001";

  const asset: Asset = {
    id: assetId,
    userId,
    kind: "investment",
    name: "Nifty 50 Index Fund",
    openedAt: new Date("2024-01-01"),
    isClosed: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01")
  };

  const link: AssetMarketLink = {
    id: "00000000-0000-0000-0000-000000000101",
    userId,
    assetId,
    provider: "amfi",
    providerInstrumentId: "120716",
    instrumentType: "mutual_fund",
    quoteUnit: "fund_unit",
    autoValuationEnabled: true,
    effectiveFrom: new Date("2024-01-01"),
    createdAt: new Date("2024-01-01")
  };

  const lot1Event: AssetPositionEvent = {
    id: "00000000-0000-0000-0000-000000000011",
    userId,
    assetId,
    eventType: "purchase",
    quantityMicroUnits: 100_000_000, // 100 units
    grossAmountMinor: 1000000, // ₹10,000 cost (NAV ₹100)
    occurredAt: new Date("2024-01-01"), // >12 months ago -> LTCG
    source: "manual",
    sourceReference: "ref1",
    createdAt: new Date("2024-01-01")
  };

  const lot2Event: AssetPositionEvent = {
    id: "00000000-0000-0000-0000-000000000012",
    userId,
    assetId,
    eventType: "purchase",
    quantityMicroUnits: 50_000_000, // 50 units
    grossAmountMinor: 750000, // ₹7,500 cost (NAV ₹150)
    occurredAt: new Date("2026-06-01"), // 2 months ago -> STCG
    source: "manual",
    sourceReference: "ref2",
    createdAt: new Date("2026-06-01")
  };

  it("calculates FIFO allocations, STCG/LTCG gains, and Section 112A exemption for mutual funds", async () => {
    const mockAssetRepo = focusedTestDouble<AssetRepository>({
      findById: vi.fn().mockResolvedValue(asset)
    });

    const mockMarketRepo = focusedTestDouble<AssetMarketRepository>({
      findActiveLinkByAssetId: vi.fn().mockResolvedValue(link),
      listAllPositionEventsByAsset: vi.fn().mockResolvedValue([lot1Event, lot2Event])
    });

    const mockQuotesRepo = focusedTestDouble<MarketQuoteRepository>({
      findLatestByLink: vi.fn().mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000201",
        userId,
        assetMarketLinkId: link.id,
        provider: "amfi",
        providerInstrumentId: "120716",
        quoteUnit: "fund_unit",
        priceMicroRupeesPerQuoteUnit: 200_000_000, // Current NAV: ₹200
        providerAsOf: new Date("2026-08-20"),
        fetchedAt: new Date("2026-08-20"),
        createdAt: new Date("2026-08-20")
      })
    });

    const mockPositionService = focusedTestDouble<AssetPositionService>({
      getCurrentPosition: vi.fn().mockResolvedValue({
        assetId,
        quantityMicroUnits: 150_000_000,
        eventCount: 2,
        asOf: new Date("2026-06-01")
      } satisfies AssetCurrentPosition)
    });

    const service = new DisposalEstimateService(
      mockAssetRepo,
      mockMarketRepo,
      mockQuotesRepo,
      mockPositionService
    );

    const result = await service.estimateDisposal(userId, assetId, {
      quantityMicroUnits: 120_000_000, // Disposing 120 units: 100 from lot1 (LTCG), 20 from lot2 (STCG)
      disposalDate: new Date("2026-08-23"),
      expectedOtherChargesMinor: 0
    });

    expect(result.quantityMicroUnits).toBe(120_000_000);
    // 120 units * ₹200 = ₹24,000 = 2,400,000 paise
    expect(result.grossProceedsMinor).toBe(2400000);

    // Lot 1: 100 units * ₹100 cost = ₹10,000 cost basis. Proceeds: 100 * ₹200 = ₹20,000. Gain = ₹10,000 (LTCG)
    // Lot 2: 20 units * ₹150 cost = ₹3,000 cost basis. Proceeds: 20 * ₹200 = ₹4,000. Gain = ₹1,000 (STCG)
    expect(result.lots).toHaveLength(2);
    expect(result.lots[0]?.term).toBe("long_term");
    expect(result.lots[0]?.quantityMicroUnits).toBe(100_000_000);
    expect(result.lots[0]?.costBasisMinor).toBe(1000000);
    expect(result.lots[0]?.gainLossMinor).toBe(1000000);

    expect(result.lots[1]?.term).toBe("short_term");
    expect(result.lots[1]?.quantityMicroUnits).toBe(20_000_000);
    expect(result.lots[1]?.costBasisMinor).toBe(300000);
    expect(result.lots[1]?.gainLossMinor).toBe(100000);

    // Total cost basis: ₹13,000 = 1,300,000 paise
    expect(result.costBasisMinor).toBe(1300000);
    // Estimated gain: ₹11,000 = 1,100,000 paise
    expect(result.estimatedGainMinor).toBe(1100000);

    // Section 112A exemption: ₹10,000 LTCG is fully exempt (since <= ₹1.25L exemption)
    // STCG tax: 20% of ₹1,000 = ₹200 = 20,000 paise
    expect(result.estimatedTaxMinor).toBe(20000);
    expect(result.postTaxProceedsMinor).toBe(2380000);
  });

  it("throws InsufficientDisposalContextError when requested quantity exceeds available lots", async () => {
    const mockAssetRepo = focusedTestDouble<AssetRepository>({
      findById: vi.fn().mockResolvedValue(asset)
    });

    const mockMarketRepo = focusedTestDouble<AssetMarketRepository>({
      findActiveLinkByAssetId: vi.fn().mockResolvedValue(link),
      listAllPositionEventsByAsset: vi.fn().mockResolvedValue([lot1Event])
    });

    const mockQuotesRepo = focusedTestDouble<MarketQuoteRepository>({
      findLatestByLink: vi.fn().mockResolvedValue(null)
    });

    const mockPositionService = focusedTestDouble<AssetPositionService>({
      getCurrentPosition: vi.fn().mockResolvedValue({
        assetId,
        quantityMicroUnits: 100_000_000,
        eventCount: 1,
        asOf: new Date("2024-01-01")
      })
    });

    const service = new DisposalEstimateService(
      mockAssetRepo,
      mockMarketRepo,
      mockQuotesRepo,
      mockPositionService
    );

    await expect(
      service.estimateDisposal(userId, assetId, {
        quantityMicroUnits: 500_000_000, // 500 units requested vs 100 units held
        disposalDate: new Date("2026-08-23"),
        quoteOverrideMicroRupeesPerUnit: 200_000_000,
        expectedOtherChargesMinor: 0
      })
    ).rejects.toThrow(InsufficientDisposalContextError);
  });
});

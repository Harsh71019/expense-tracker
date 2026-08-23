import { Injectable } from "@nestjs/common";
import {
  calculateMarketValueMinor,
  type AssetId,
  type AssetMarketValuationDetails,
  type MarketQuoteFreshness,
  type MarketQuoteWithFreshness
} from "@treasury-ops/shared";

import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { AssetMarketRepository } from "./asset-market.repository.js";
import { AssetPositionService } from "./asset-position.service.js";
import { AssetRepository } from "./asset.repository.js";
import { MarketQuoteRepository } from "./market-quote.repository.js";
import { MarketValuationRefreshService } from "./market-valuation-refresh.service.js";
import { ValuationRepository } from "./valuation.repository.js";

@Injectable()
export class AssetMarketValuationService {
  constructor(
    private readonly assets: AssetRepository,
    private readonly market: AssetMarketRepository,
    private readonly quotes: MarketQuoteRepository,
    private readonly positions: AssetPositionService,
    private readonly valuations: ValuationRepository,
    private readonly refreshService: MarketValuationRefreshService
  ) {}

  async getValuationDetails(
    userId: string,
    assetId: AssetId
  ): Promise<AssetMarketValuationDetails> {
    const asset = await this.assets.findById(userId, assetId);
    if (asset === null) throw new EntityNotFoundError("Asset");

    const activeLink = await this.market.findActiveLinkByAssetId(userId, assetId);
    const position = await this.positions.getCurrentPosition(userId, assetId);

    const latestQuoteRaw =
      activeLink === null ? null : await this.quotes.findLatestByLink(userId, activeLink.id);

    const valuations = await this.valuations.listByAsset(userId, assetId);
    const latestValuation = valuations[0] ?? null;

    let quoteWithFreshness: MarketQuoteWithFreshness | null = null;
    const warnings: string[] = [];

    if (latestQuoteRaw !== null) {
      const freshness = computeQuoteFreshness(latestQuoteRaw.provider, latestQuoteRaw.providerAsOf);
      quoteWithFreshness = {
        ...latestQuoteRaw,
        freshness: freshness.status
      };

      if (freshness.status === "stale") {
        warnings.push("quote_stale");
      } else if (freshness.status === "delayed") {
        warnings.push("quote_delayed");
      }
    } else if (activeLink !== null) {
      warnings.push("quote_unavailable");
    }

    let estimatedValueMinor: number | null = null;
    if (quoteWithFreshness !== null && position.quantityMicroUnits > 0) {
      estimatedValueMinor = calculateMarketValueMinor(
        position.quantityMicroUnits,
        quoteWithFreshness.priceMicroRupeesPerQuoteUnit,
        activeLink?.purityBps
      );
    } else if (latestValuation !== null) {
      estimatedValueMinor = latestValuation.valueMinor;
    }

    const events = await this.market.listAllPositionEventsByAsset(userId, assetId);
    const reconciliations = events
      .filter((e) => e.eventType === "reconciliation_in")
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const lastReconciledAt = reconciliations[0]?.occurredAt ?? null;

    if (
      activeLink !== null &&
      activeLink.instrumentType === "mutual_fund" &&
      (lastReconciledAt === null || Date.now() - lastReconciledAt.getTime() > 90 * 24 * 3_600_000)
    ) {
      warnings.push("reconciliation_recommended");
    }

    const asOf = quoteWithFreshness?.providerAsOf ?? latestValuation?.valuedAt ?? null;

    return {
      assetId,
      position,
      quote: quoteWithFreshness,
      valuation: latestValuation,
      estimatedValueMinor,
      asOf,
      lastReconciledAt,
      warnings
    };
  }

  async triggerRefresh(
    userId: string,
    assetId: AssetId
  ): Promise<{ status: "queued" | "completed"; assetId: AssetId }> {
    const asset = await this.assets.findById(userId, assetId);
    if (asset === null) throw new EntityNotFoundError("Asset");

    await this.refreshService.refreshTrackedAmfiAssets();
    return { status: "completed", assetId };
  }
}

function computeQuoteFreshness(
  provider: string,
  providerAsOf: Date
): Readonly<{ status: MarketQuoteFreshness; ageHours: number }> {
  const ageMs = Math.max(0, Date.now() - providerAsOf.getTime());
  const ageHours = Math.round((ageMs / 3_600_000) * 10) / 10;

  if (provider === "amfi") {
    if (ageHours <= 72) return { status: "fresh", ageHours };
    if (ageHours <= 168) return { status: "delayed", ageHours };
    return { status: "stale", ageHours };
  }

  if (provider === "goldapi") {
    if (ageHours <= 24) return { status: "fresh", ageHours };
    if (ageHours <= 48) return { status: "delayed", ageHours };
    return { status: "stale", ageHours };
  }

  if (ageHours <= 24) return { status: "fresh", ageHours };
  if (ageHours <= 72) return { status: "delayed", ageHours };
  return { status: "stale", ageHours };
}

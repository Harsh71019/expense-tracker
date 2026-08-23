import { Inject, Injectable, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  calculateMarketValueMinor,
  deriveAssetCurrentPosition,
  type MarketValuation
} from "@treasury-ops/shared";

import { AuditRepository } from "../audit/audit.repository.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DATABASE_CONNECTION, type DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import {
  runScheduled,
  ScheduledRunCoordinator
} from "../common/scheduler/scheduled-run.coordinator.js";
import { AmfiNavService } from "./amfi-nav.service.js";
import { AssetMarketRepository } from "./asset-market.repository.js";
import { AssetService } from "./asset.service.js";
import { MarketQuoteRepository, type MarketQuoteRefreshTarget } from "./market-quote.repository.js";

/** Refreshes tracked AMFI NAVs in the worker, then records derived valuations. */
@Injectable()
export class MarketValuationRefreshService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly config: RuntimeConfigService,
    private readonly amfi: AmfiNavService,
    private readonly quotes: MarketQuoteRepository,
    private readonly market: AssetMarketRepository,
    private readonly assets: AssetService,
    private readonly audit: AuditRepository,
    @Optional() private readonly scheduler?: ScheduledRunCoordinator
  ) {}

  @Cron("15 19 * * *", { timeZone: "Asia/Kolkata" })
  async refresh(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;
    await runScheduled(this.scheduler, "assets.amfi_nav_refresh", "daily", async () => {
      return this.refreshTrackedAmfiAssets();
    });
  }

  async refreshTrackedAmfiAssets(): Promise<number> {
    const targets = (await this.quotes.systemListAutoRefreshTargets()).filter(
      (target) => target.provider === "amfi" && target.quoteUnit === "fund_unit"
    );
    const schemeCodes = new Set(targets.map((target) => target.providerInstrumentId));
    const fetchedAt = new Date();
    const quotesBySchemeCode = await this.amfi.fetchTrackedQuotes(schemeCodes);

    let refreshed = 0;
    for (const target of targets) {
      const quote = quotesBySchemeCode.get(target.providerInstrumentId);
      if (quote === undefined) continue;
      const valuation = await this.persistTarget(target, quote, fetchedAt);
      if (valuation !== null) refreshed += 1;
    }
    return refreshed;
  }

  private async persistTarget(
    target: MarketQuoteRefreshTarget,
    quote: Readonly<{ priceMicroRupeesPerUnit: number; providerAsOf: Date }>,
    fetchedAt: Date
  ): Promise<MarketValuation | null> {
    return withTxn(this.db, async (tx) => {
      const activeLink = await this.market.findLinkByIdForUpdate(
        target.userId,
        target.assetMarketLinkId,
        tx
      );
      if (
        activeLink === null ||
        activeLink.supersededAt !== undefined ||
        activeLink.provider !== "amfi" ||
        activeLink.quoteUnit !== "fund_unit" ||
        activeLink.providerInstrumentId !== target.providerInstrumentId
      ) {
        return null;
      }

      const persistedQuote = await this.quotes.createIfAbsent(
        target.userId,
        {
          assetMarketLinkId: activeLink.id,
          provider: "amfi",
          providerInstrumentId: activeLink.providerInstrumentId,
          quoteUnit: "fund_unit",
          priceMicroRupeesPerQuoteUnit: quote.priceMicroRupeesPerUnit,
          providerAsOf: quote.providerAsOf,
          fetchedAt
        },
        tx
      );
      if (!persistedQuote.inserted) return null;

      await this.audit.record(
        target.userId,
        "asset.market_quote.create",
        persistedQuote.quote.id,
        tx,
        {
          assetId: target.assetId,
          assetMarketLinkId: activeLink.id,
          provider: "amfi"
        }
      );

      const position = deriveAssetCurrentPosition(
        target.assetId,
        await this.market.listAllPositionEventsByAsset(target.userId, target.assetId, tx)
      );
      if (position.quantityMicroUnits < 0) return null;
      const valueMinor =
        position.quantityMicroUnits === 0
          ? 0
          : calculateMarketValueMinor(
              position.quantityMicroUnits,
              persistedQuote.quote.priceMicroRupeesPerQuoteUnit
            );
      const valuation = await this.assets.addValuationInTx(
        target.userId,
        target.assetId,
        {
          valueMinor,
          valuedAt: persistedQuote.quote.providerAsOf,
          source: "market_quote"
        },
        tx
      );
      return {
        assetId: target.assetId,
        quote: persistedQuote.quote,
        quantityMicroUnits: position.quantityMicroUnits,
        valueMinor: valuation.valueMinor,
        valuedAt: valuation.valuedAt
      };
    });
  }
}

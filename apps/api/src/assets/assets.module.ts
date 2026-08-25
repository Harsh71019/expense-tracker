import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { ReceivablesModule } from "../receivables/receivables.module.js";
import { AssetController } from "./asset.controller.js";
import { AssetMarketController } from "./asset-market.controller.js";
import { AssetRepository } from "./asset.repository.js";
import { AssetMarketRepository } from "./asset-market.repository.js";
import { AssetMarketLinkService } from "./asset-market-link.service.js";
import { AssetMarketMutationService } from "./asset-market-mutation.service.js";
import { AssetPositionService } from "./asset-position.service.js";
import { AssetService } from "./asset.service.js";
import { AssetMutationService } from "./asset-mutation.service.js";
import { AssetDiagnosticReadService } from "./asset-diagnostic-read.service.js";
import { AssetReserveCandidateReadService } from "./asset-reserve-candidate-read.service.js";
import { LiabilityAssetReadService } from "./liability-asset-read.service.js";
import { MarketRatesService } from "./market-rates.service.js";
import { MarketRatesRefreshService } from "./market-rates-refresh.service.js";
import { MarketQuoteRepository } from "./market-quote.repository.js";
import { AmfiNavService } from "./amfi-nav.service.js";
import { MarketValuationRefreshService } from "./market-valuation-refresh.service.js";
import { MarketLinkedAssetService } from "./market-linked-asset.service.js";
import { ValuationRepository } from "./valuation.repository.js";
import { AssetFundingRepository } from "../asset-fundings/asset-funding.repository.js";

import { InstrumentDiscoveryService } from "./instrument-discovery.service.js";
import { AssetMarketValuationService } from "./asset-market-valuation.service.js";
import { DisposalEstimateService } from "./disposal-estimate.service.js";

@Module({
  imports: [AccountsModule, ReceivablesModule],
  controllers: [AssetController, AssetMarketController],
  providers: [
    AssetRepository,
    AssetMarketRepository,
    AssetMarketLinkService,
    AssetPositionService,
    MarketLinkedAssetService,
    AssetMarketMutationService,
    AssetFundingRepository,
    AssetService,
    ValuationRepository,
    AssetMutationService,
    LiabilityAssetReadService,
    AssetDiagnosticReadService,
    AssetReserveCandidateReadService,
    MarketRatesService,
    MarketRatesRefreshService,
    MarketQuoteRepository,
    AmfiNavService,
    MarketValuationRefreshService,
    InstrumentDiscoveryService,
    AssetMarketValuationService,
    DisposalEstimateService
  ],
  // Export narrow read services for cross-module consumption (NetWorthModule
  // composes these with AccountsModule/ReceivablesModule -- see net-worth/).
  // AssetFundingRepository is exported too: NetWorthService needs it to fold
  // post-valuation funding contributions into an asset's current value.
  exports: [
    AssetRepository,
    AssetMarketRepository,
    AssetMarketLinkService,
    AssetPositionService,
    AssetFundingRepository,
    AssetService,
    ValuationRepository,
    LiabilityAssetReadService,
    AssetDiagnosticReadService,
    AssetReserveCandidateReadService,
    MarketRatesService,
    MarketQuoteRepository,
    InstrumentDiscoveryService,
    AssetMarketValuationService,
    DisposalEstimateService
  ]
})
export class AssetsModule {}

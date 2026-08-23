import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { ReceivablesModule } from "../receivables/receivables.module.js";
import { AssetController } from "./asset.controller.js";
import { AssetRepository } from "./asset.repository.js";
import { AssetMarketRepository } from "./asset-market.repository.js";
import { AssetService } from "./asset.service.js";
import { AssetMutationService } from "./asset-mutation.service.js";
import { AssetDiagnosticReadService } from "./asset-diagnostic-read.service.js";
import { LiabilityAssetReadService } from "./liability-asset-read.service.js";
import { MarketRatesService } from "./market-rates.service.js";
import { ValuationRepository } from "./valuation.repository.js";
import { AssetFundingRepository } from "../asset-fundings/asset-funding.repository.js";

@Module({
  imports: [AccountsModule, ReceivablesModule],
  controllers: [AssetController],
  providers: [
    AssetRepository,
    AssetMarketRepository,
    AssetFundingRepository,
    AssetService,
    ValuationRepository,
    AssetMutationService,
    LiabilityAssetReadService,
    AssetDiagnosticReadService,
    MarketRatesService
  ],
  // Export narrow read services for cross-module consumption (NetWorthModule
  // composes these with AccountsModule/ReceivablesModule -- see net-worth/).
  // AssetFundingRepository is exported too: NetWorthService needs it to fold
  // post-valuation funding contributions into an asset's current value.
  exports: [
    AssetRepository,
    AssetMarketRepository,
    AssetFundingRepository,
    AssetService,
    ValuationRepository,
    LiabilityAssetReadService,
    AssetDiagnosticReadService,
    MarketRatesService
  ]
})
export class AssetsModule {}

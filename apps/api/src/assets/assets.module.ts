import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { AssetController } from "./asset.controller.js";
import { AssetRepository } from "./asset.repository.js";
import { AssetService } from "./asset.service.js";
import { AssetMutationService } from "./asset-mutation.service.js";
import { AssetDiagnosticReadService } from "./asset-diagnostic-read.service.js";
import { LiabilityAssetReadService } from "./liability-asset-read.service.js";
import { NetWorthController } from "./net-worth.controller.js";
import { NetWorthService } from "./net-worth.service.js";
import { ValuationRepository } from "./valuation.repository.js";
import { AssetFundingRepository } from "../asset-fundings/asset-funding.repository.js";

@Module({
  imports: [AccountsModule],
  controllers: [AssetController, NetWorthController],
  providers: [
    AssetRepository,
    AssetFundingRepository,
    AssetService,
    ValuationRepository,
    AssetService,
    AssetMutationService,
    LiabilityAssetReadService,
    AssetDiagnosticReadService,
    NetWorthService
  ],
  // Export narrow read services for cross-module consumption
  exports: [
    AssetRepository,
    ValuationRepository,
    LiabilityAssetReadService,
    AssetDiagnosticReadService
  ]
})
export class AssetsModule {}

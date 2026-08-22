import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { ReceivablesModule } from "../receivables/receivables.module.js";
import { AssetController } from "./asset.controller.js";
import { AssetRepository } from "./asset.repository.js";
import { AssetService } from "./asset.service.js";
import { AssetMutationService } from "./asset-mutation.service.js";
import { AssetDiagnosticReadService } from "./asset-diagnostic-read.service.js";
import { LiabilityAssetReadService } from "./liability-asset-read.service.js";
import { ValuationRepository } from "./valuation.repository.js";

@Module({
  imports: [AccountsModule, ReceivablesModule],
  controllers: [AssetController],
  providers: [
    AssetRepository,
    ValuationRepository,
    AssetService,
    AssetMutationService,
    LiabilityAssetReadService,
    AssetDiagnosticReadService
  ],
  // Export narrow read services for cross-module consumption (NetWorthModule
  // composes these with AccountsModule/ReceivablesModule -- see net-worth/).
  exports: [
    AssetRepository,
    ValuationRepository,
    LiabilityAssetReadService,
    AssetDiagnosticReadService
  ]
})
export class AssetsModule {}

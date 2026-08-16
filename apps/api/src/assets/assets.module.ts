import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { AssetController } from "./asset.controller.js";
import { AssetRepository } from "./asset.repository.js";
import { AssetService } from "./asset.service.js";
import { AssetMutationService } from "./asset-mutation.service.js";
import { LiabilityAssetReadService } from "./liability-asset-read.service.js";
import { NetWorthController } from "./net-worth.controller.js";
import { NetWorthService } from "./net-worth.service.js";
import { ValuationRepository } from "./valuation.repository.js";

@Module({
  imports: [AccountsModule],
  controllers: [AssetController, NetWorthController],
  providers: [
    AssetRepository,
    ValuationRepository,
    AssetService,
    AssetMutationService,
    LiabilityAssetReadService,
    NetWorthService
  ],
  // LiabilityAssetReadService is the only asset surface other modules may use
  // for loan-liability facts — a read-only, tenant-scoped, parsed contract.
  exports: [AssetRepository, ValuationRepository, LiabilityAssetReadService]
})
export class AssetsModule {}

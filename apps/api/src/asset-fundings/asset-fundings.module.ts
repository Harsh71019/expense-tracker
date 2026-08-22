import { Module } from "@nestjs/common";

import { AssetsModule } from "../assets/assets.module.js";
import { ReportsModule } from "../reports/reports.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { AssetFundingController } from "./asset-funding.controller.js";
import { AssetFundingMutationService } from "./asset-funding-mutation.service.js";
import { AssetFundingRepository } from "./asset-funding.repository.js";
import { AssetFundingService } from "./asset-funding.service.js";

@Module({
  imports: [AssetsModule, TransactionsModule, ReportsModule],
  controllers: [AssetFundingController],
  providers: [AssetFundingRepository, AssetFundingService, AssetFundingMutationService],
  exports: [AssetFundingService]
})
export class AssetFundingsModule {}

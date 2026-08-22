import { Global, Module } from "@nestjs/common";

import { TRANSACTION_REVERSAL_HOOK } from "../transactions/transaction-reversal-hook.js";
import { AssetFundingsModule } from "./asset-fundings.module.js";
import { AssetFundingService } from "./asset-funding.service.js";

@Global()
@Module({
  imports: [AssetFundingsModule],
  providers: [{ provide: TRANSACTION_REVERSAL_HOOK, useExisting: AssetFundingService }],
  exports: [TRANSACTION_REVERSAL_HOOK]
})
export class TransactionAssetFundingHookModule {}

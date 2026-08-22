import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { TransactionController } from "./transaction.controller.js";
import { TransactionRepository } from "./transaction.repository.js";
import { TransactionService } from "./transaction.service.js";
import { LedgerHistoryDiagnosticReadService } from "./ledger-history-diagnostic-read.service.js";
import { TransactionMutationService } from "./transaction-mutation.service.js";
import { TransferController } from "./transfer.controller.js";
import { TransferService } from "./transfer.service.js";
import { AssetFundingRepository } from "../asset-fundings/asset-funding.repository.js";

@Module({
  imports: [AccountsModule, CategoriesModule],
  controllers: [TransactionController, TransferController],
  providers: [
    TransactionRepository,
    AssetFundingRepository,
    TransactionService,
    TransactionMutationService,
    TransferService,
    LedgerHistoryDiagnosticReadService
  ],
  exports: [
    TransactionRepository,
    TransactionService,
    TransferService,
    LedgerHistoryDiagnosticReadService
  ]
})
export class TransactionsModule {}

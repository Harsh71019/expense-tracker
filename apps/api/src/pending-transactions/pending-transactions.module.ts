import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { PendingTransactionMutationService } from "./pending-transaction-mutation.service.js";
import { PendingTransactionController } from "./pending-transaction.controller.js";
import { PendingTransactionRepository } from "./pending-transaction.repository.js";
import { PendingTransactionService } from "./pending-transaction.service.js";

@Module({
  imports: [AccountsModule, TransactionsModule],
  controllers: [PendingTransactionController],
  providers: [
    PendingTransactionRepository,
    PendingTransactionService,
    PendingTransactionMutationService
  ]
})
export class PendingTransactionsModule {}

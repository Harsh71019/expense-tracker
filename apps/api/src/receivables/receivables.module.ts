import { Module } from "@nestjs/common";

import { TransactionsModule } from "../transactions/transactions.module.js";
import { ReceivableController } from "./receivable.controller.js";
import { ReceivableMutationService } from "./receivable-mutation.service.js";
import { ReceivableNetWorthReadService } from "./receivable-net-worth-read.service.js";
import { ReceivableRepository } from "./receivable.repository.js";
import { ReceivableService } from "./receivable.service.js";
import { ReceivableTransactionReversalPolicy } from "./receivable-transaction-reversal-policy.js";

@Module({
  imports: [TransactionsModule],
  controllers: [ReceivableController],
  providers: [
    ReceivableRepository,
    ReceivableService,
    ReceivableMutationService,
    ReceivableTransactionReversalPolicy,
    ReceivableNetWorthReadService
  ],
  exports: [
    ReceivableService,
    ReceivableRepository,
    ReceivableTransactionReversalPolicy,
    ReceivableNetWorthReadService
  ]
})
export class ReceivablesModule {}

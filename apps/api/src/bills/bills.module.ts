import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { BillGenerationCron } from "./bill-generation.cron.js";
import { BillReconciliationService } from "./bill-reconciliation.service.js";
import { BillStatementRepository } from "./bill-statement.repository.js";
import { BillStatementsQueue } from "./bill-statements.queue.js";
import { BillsController, CreditCardConfigController } from "./bills.controller.js";
import { BillsService } from "./bills.service.js";
import { CreditCardBillRepository } from "./credit-card-bill.repository.js";

@Module({
  imports: [AccountsModule, TransactionsModule],
  controllers: [CreditCardConfigController, BillsController],
  providers: [
    CreditCardBillRepository,
    BillStatementRepository,
    BillStatementsQueue,
    BillsService,
    BillReconciliationService,
    BillGenerationCron
  ],
  exports: [BillsService, BillReconciliationService, BillStatementsQueue]
})
export class BillsModule {}

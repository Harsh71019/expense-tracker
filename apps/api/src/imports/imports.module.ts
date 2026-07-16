import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { ImportBatchRepository } from "./import-batch.repository.js";
import { ImportsController } from "./imports.controller.js";
import { ImportsQueue } from "./imports.queue.js";
import { ImportsService } from "./imports.service.js";
import { StagedRowRepository } from "./staged-row.repository.js";

@Module({
  imports: [TransactionsModule, AccountsModule],
  controllers: [ImportsController],
  providers: [ImportBatchRepository, StagedRowRepository, ImportsQueue, ImportsService],
  exports: [ImportBatchRepository, StagedRowRepository, ImportsQueue, ImportsService]
})
export class ImportsModule {}

import { Module } from "@nestjs/common";

import { TransactionsModule } from "../transactions/transactions.module.js";
import { ImportBatchRepository } from "./import-batch.repository.js";
import { ImportsController } from "./imports.controller.js";
import { ImportsQueue } from "./imports.queue.js";
import { ImportsService } from "./imports.service.js";
import { StagedRowRepository } from "./staged-row.repository.js";

@Module({
  imports: [TransactionsModule],
  controllers: [ImportsController],
  providers: [ImportBatchRepository, StagedRowRepository, ImportsQueue, ImportsService],
  exports: [ImportBatchRepository, StagedRowRepository, ImportsQueue, ImportsService]
})
export class ImportsModule {}

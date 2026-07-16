import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { ExportController } from "./export.controller.js";
import { ExportService } from "./export.service.js";

@Module({
  imports: [TransactionsModule, AccountsModule, CategoriesModule],
  controllers: [ExportController],
  providers: [ExportService]
})
export class ExportModule {}

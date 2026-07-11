import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { TransactionController } from "./transaction.controller.js";
import { TransactionRepository } from "./transaction.repository.js";
import { TransactionService } from "./transaction.service.js";

@Module({
  imports: [AccountsModule, CategoriesModule],
  controllers: [TransactionController],
  providers: [TransactionRepository, TransactionService]
})
export class TransactionsModule {}

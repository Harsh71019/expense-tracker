import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { RecurringMaterializeService } from "./recurring-materialize.service.js";
import { RecurringRuleController } from "./recurring-rule.controller.js";
import { RecurringRuleRepository } from "./recurring-rule.repository.js";
import { RecurringRuleService } from "./recurring-rule.service.js";

@Module({
  imports: [AccountsModule, CategoriesModule, TransactionsModule],
  controllers: [RecurringRuleController],
  providers: [RecurringRuleRepository, RecurringRuleService, RecurringMaterializeService]
})
export class RecurringModule {}

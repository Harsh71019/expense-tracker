import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { RecurringMaterializeService } from "./recurring-materialize.service.js";
import { RecurringReconciliationController } from "./recurring-reconciliation.controller.js";
import { RecurringReconciliationRepository } from "./recurring-reconciliation.repository.js";
import { RecurringReconciliationService } from "./recurring-reconciliation.service.js";
import { RecurringRuleController } from "./recurring-rule.controller.js";
import { RecurringRuleRepository } from "./recurring-rule.repository.js";
import { RecurringRuleService } from "./recurring-rule.service.js";
import { RecurringRuleMutationService } from "./recurring-rule-mutation.service.js";
import { RecurringStatsService } from "./recurring-stats.service.js";

@Module({
  imports: [AccountsModule, CategoriesModule, TransactionsModule],
  controllers: [RecurringRuleController, RecurringReconciliationController],
  providers: [
    RecurringRuleRepository,
    RecurringRuleService,
    RecurringRuleMutationService,
    RecurringStatsService,
    RecurringMaterializeService,
    RecurringReconciliationRepository,
    RecurringReconciliationService
  ],
  exports: [RecurringRuleRepository, RecurringReconciliationService]
})
export class RecurringModule {}

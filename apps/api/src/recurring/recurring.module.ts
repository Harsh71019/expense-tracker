import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { RecurringMaterializeService } from "./recurring-materialize.service.js";
import { RecurringOccurrenceController } from "./recurring-occurrence.controller.js";
import { RecurringOccurrenceRepository } from "./recurring-occurrence.repository.js";
import { RecurringOccurrenceService } from "./recurring-occurrence.service.js";
import { RecurringReconciliationController } from "./recurring-reconciliation.controller.js";
import { RecurringReconciliationRepository } from "./recurring-reconciliation.repository.js";
import { RecurringReconciliationService } from "./recurring-reconciliation.service.js";
import { RecurringReconciliationSweepService } from "./recurring-reconciliation-sweep.service.js";
import { RecurringRuleController } from "./recurring-rule.controller.js";
import { RecurringRuleRepository } from "./recurring-rule.repository.js";
import { RecurringRuleService } from "./recurring-rule.service.js";
import { RecurringRuleMutationService } from "./recurring-rule-mutation.service.js";
import { RecurringStatsService } from "./recurring-stats.service.js";

@Module({
  imports: [AccountsModule, CategoriesModule, TransactionsModule],
  controllers: [
    RecurringRuleController,
    RecurringReconciliationController,
    RecurringOccurrenceController
  ],
  providers: [
    RecurringRuleRepository,
    RecurringRuleService,
    RecurringRuleMutationService,
    RecurringStatsService,
    RecurringOccurrenceRepository,
    RecurringOccurrenceService,
    RecurringMaterializeService,
    RecurringReconciliationRepository,
    RecurringReconciliationService,
    RecurringReconciliationSweepService
  ],
  exports: [RecurringRuleRepository, RecurringReconciliationService, RecurringOccurrenceService]
})
export class RecurringModule {}

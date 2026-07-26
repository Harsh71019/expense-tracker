import { Module } from "@nestjs/common";

import { CategoriesModule } from "../categories/categories.module.js";
import { BudgetAlertCron } from "./budget-alert.cron.js";
import { BudgetController } from "./budget.controller.js";
import { BudgetMutationService } from "./budget-mutation.service.js";
import { BudgetRepository } from "./budget.repository.js";
import { BudgetService } from "./budget.service.js";

@Module({
  imports: [CategoriesModule],
  controllers: [BudgetController],
  providers: [BudgetRepository, BudgetService, BudgetMutationService, BudgetAlertCron]
})
export class BudgetsModule {}

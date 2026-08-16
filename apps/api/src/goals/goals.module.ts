import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { ForecastingModule } from "../insights/forecasting/forecasting.module.js";
import { SafetyBufferModule } from "../safety-buffer/safety-buffer.module.js";
import { GoalController } from "./goal.controller.js";
import { GoalMutationService } from "./goal-mutation.service.js";
import { GoalRepository } from "./goal.repository.js";
import { GoalService } from "./goal.service.js";
import { GoalsProgressCron } from "./goals-progress.cron.js";

@Module({
  imports: [AccountsModule, TransactionsModule, ForecastingModule, SafetyBufferModule],
  controllers: [GoalController],
  providers: [GoalRepository, GoalService, GoalMutationService, GoalsProgressCron],
  exports: [GoalService, GoalRepository]
})
export class GoalsModule {}

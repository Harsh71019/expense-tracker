import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { RecurringModule } from "../recurring/recurring.module.js";
import { ReportsModule } from "../reports/reports.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardRepository } from "./dashboard.repository.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  imports: [
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    AssetsModule,
    RecurringModule,
    ReportsModule
  ],
  controllers: [DashboardController],
  providers: [DashboardRepository, DashboardService]
})
export class DashboardModule {}

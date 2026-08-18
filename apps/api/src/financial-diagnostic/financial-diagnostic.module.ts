import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { FinancialProfilesModule } from "../financial-profiles/financial-profiles.module.js";
import { GoalsModule } from "../goals/goals.module.js";
import { SafetyBufferModule } from "../safety-buffer/safety-buffer.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { FinancialDiagnosticController } from "./financial-diagnostic.controller.js";
import { FinancialDiagnosticService } from "./financial-diagnostic.service.js";

/**
 * Dedicated composed-read module for the Financial Readiness Diagnostic.
 *
 * This module composes bounded read ports across accounts, categories, ledger,
 * assets, goals, profile, protection, debts, and safety buffer without turning
 * any domain module into an uncontrolled dependency hub.
 */
@Module({
  imports: [
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    AssetsModule,
    GoalsModule,
    FinancialProfilesModule,
    SafetyBufferModule
  ],
  controllers: [FinancialDiagnosticController],
  providers: [FinancialDiagnosticService],
  exports: [FinancialDiagnosticService]
})
export class FinancialDiagnosticModule {}

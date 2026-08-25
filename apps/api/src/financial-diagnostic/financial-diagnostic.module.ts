import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { FinancialProfilesModule } from "../financial-profiles/financial-profiles.module.js";
import { FinancialSafetyModule } from "../financial-safety/financial-safety.module.js";
import { GoalsModule } from "../goals/goals.module.js";
import { SafetyBufferModule } from "../safety-buffer/safety-buffer.module.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { FinancialDiagnosticController } from "./financial-diagnostic.controller.js";
import { FinancialDiagnosticService } from "./financial-diagnostic.service.js";

/**
 * Dedicated composed-read module for the Financial Readiness Diagnostic.
 *
 * This module composes bounded read ports across accounts, categories, ledger,
 * assets, goals, profile, protection, debts, safety buffer, and reserve
 * sources without turning any domain module into an uncontrolled dependency
 * hub. `FinancialSafetyModule` does not import this module (or any of the
 * modules it composes), so this import direction cannot create a cycle.
 */
@Module({
  imports: [
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    AssetsModule,
    GoalsModule,
    FinancialProfilesModule,
    SafetyBufferModule,
    FinancialSafetyModule
  ],
  controllers: [FinancialDiagnosticController],
  providers: [FinancialDiagnosticService],
  exports: [FinancialDiagnosticService]
})
export class FinancialDiagnosticModule {}

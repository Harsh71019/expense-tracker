import { Module } from "@nestjs/common";

import { AccountController } from "./account.controller.js";
import { AccountInsightsRepository } from "./account-insights.repository.js";
import { AccountRepository } from "./account.repository.js";
import { AccountService } from "./account.service.js";
import { AccountDiagnosticReadService } from "./account-diagnostic-read.service.js";
import { AccountMutationService } from "./account-mutation.service.js";

@Module({
  controllers: [AccountController],
  providers: [
    AccountRepository,
    AccountInsightsRepository,
    AccountService,
    AccountMutationService,
    AccountDiagnosticReadService
  ],
  exports: [AccountRepository, AccountDiagnosticReadService]
})
export class AccountsModule {}

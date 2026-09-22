import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { DbModule } from "../common/db/db.module.js";
import { IdempotencyModule } from "../common/idempotency/idempotency.module.js";
import { FinancialProfilesModule } from "../financial-profiles/financial-profiles.module.js";
import { SafetyBufferModule } from "../safety-buffer/safety-buffer.module.js";
import { EssentialBurnRepository } from "./essential-burn.repository.js";
import { EssentialBurnService } from "./essential-burn.service.js";
import { FinancialSafetyController } from "./financial-safety.controller.js";
import { ReserveSourceDiagnosticReadService } from "./reserve-source-diagnostic-read.service.js";
import { ReserveSourceRepository } from "./reserve-source.repository.js";
import { ReserveSourceService } from "./reserve-source.service.js";
import { ReserveValueService } from "./reserve-value.service.js";
import { SafetyEvaluationRepository } from "./safety-evaluation.repository.js";
import { SafetyEvaluationService } from "./safety-evaluation.service.js";

/**
 * `FinancialProfilesModule` and `SafetyBufferModule` are imported so
 * `SafetyEvaluationService` can compose protection, declared-debt, salary,
 * and safety-buffer-preference facts through their exported services. Neither
 * of those modules imports this one (or `FinancialDiagnosticModule`, which
 * imports this module), so the dependency stays one-way and cannot cycle.
 */
@Module({
  imports: [
    DbModule,
    AuthModule,
    AccountsModule,
    AssetsModule,
    AuditModule,
    IdempotencyModule,
    FinancialProfilesModule,
    SafetyBufferModule
  ],
  controllers: [FinancialSafetyController],
  providers: [
    EssentialBurnRepository,
    EssentialBurnService,
    ReserveSourceRepository,
    ReserveSourceService,
    ReserveValueService,
    ReserveSourceDiagnosticReadService,
    SafetyEvaluationRepository,
    SafetyEvaluationService
  ],
  exports: [
    EssentialBurnService,
    EssentialBurnRepository,
    ReserveSourceRepository,
    ReserveSourceService,
    ReserveValueService,
    ReserveSourceDiagnosticReadService,
    SafetyEvaluationService
  ]
})
export class FinancialSafetyModule {}

import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { DbModule } from "../common/db/db.module.js";
import { IdempotencyModule } from "../common/idempotency/idempotency.module.js";
import { EssentialBurnRepository } from "./essential-burn.repository.js";
import { EssentialBurnService } from "./essential-burn.service.js";
import { FinancialSafetyController } from "./financial-safety.controller.js";
import { ReserveSourceDiagnosticReadService } from "./reserve-source-diagnostic-read.service.js";
import { ReserveSourceRepository } from "./reserve-source.repository.js";
import { ReserveSourceService } from "./reserve-source.service.js";
import { ReserveValueService } from "./reserve-value.service.js";

@Module({
  imports: [DbModule, AuthModule, AccountsModule, AssetsModule, AuditModule, IdempotencyModule],
  controllers: [FinancialSafetyController],
  providers: [
    EssentialBurnRepository,
    EssentialBurnService,
    ReserveSourceRepository,
    ReserveSourceService,
    ReserveValueService,
    ReserveSourceDiagnosticReadService
  ],
  exports: [
    EssentialBurnService,
    EssentialBurnRepository,
    ReserveSourceRepository,
    ReserveSourceService,
    ReserveValueService,
    ReserveSourceDiagnosticReadService
  ]
})
export class FinancialSafetyModule {}

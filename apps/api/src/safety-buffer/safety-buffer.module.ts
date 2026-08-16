import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { ForecastingModule } from "../insights/forecasting/forecasting.module.js";
import { IdempotencyModule } from "../common/idempotency/idempotency.module.js";
import { SafetyBufferController } from "./safety-buffer.controller.js";
import { SafetyBufferRepository } from "./safety-buffer.repository.js";
import { SafetyBufferService } from "./safety-buffer.service.js";

@Module({
  imports: [AccountsModule, AuditModule, ForecastingModule, IdempotencyModule],
  controllers: [SafetyBufferController],
  providers: [SafetyBufferRepository, SafetyBufferService],
  exports: [SafetyBufferService, SafetyBufferRepository]
})
export class SafetyBufferModule {}

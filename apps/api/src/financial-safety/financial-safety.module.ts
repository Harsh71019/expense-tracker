import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DbModule } from "../common/db/db.module.js";
import { EssentialBurnRepository } from "./essential-burn.repository.js";
import { EssentialBurnService } from "./essential-burn.service.js";
import { FinancialSafetyController } from "./financial-safety.controller.js";

@Module({
  imports: [DbModule, AuthModule],
  controllers: [FinancialSafetyController],
  providers: [EssentialBurnRepository, EssentialBurnService],
  exports: [EssentialBurnService, EssentialBurnRepository]
})
export class FinancialSafetyModule {}

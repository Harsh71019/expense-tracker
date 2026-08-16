import { Module } from "@nestjs/common";

import { FinancialProfileController } from "./financial-profile.controller.js";
import { FinancialProfileRepository } from "./financial-profile.repository.js";
import { FinancialProfileService } from "./financial-profile.service.js";

@Module({
  controllers: [FinancialProfileController],
  providers: [FinancialProfileRepository, FinancialProfileService],
  exports: [FinancialProfileRepository, FinancialProfileService]
})
export class FinancialProfilesModule {}

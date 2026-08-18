import { Module } from "@nestjs/common";

import { AssetsModule } from "../assets/assets.module.js";
import { DebtProfileService } from "./debt-profile.service.js";
import { DeclaredDebtRepository } from "./debt-profile.repository.js";
import { FinancialProfileController } from "./financial-profile.controller.js";
import { FinancialProfileRepository } from "./financial-profile.repository.js";
import { FinancialProfileService } from "./financial-profile.service.js";
import { ProtectionRepository } from "./protection.repository.js";
import { ProtectionService } from "./protection.service.js";

/**
 * `AssetsModule` is imported for exactly one thing: `LiabilityAssetReadService`,
 * the read-only contract a linked debt uses to derive its outstanding amount
 * from an existing `loan_liability` asset. Nothing here reaches into the assets
 * module's repositories, and the dependency runs one way — assets know nothing
 * about financial profiles.
 */
@Module({
  imports: [AssetsModule],
  controllers: [FinancialProfileController],
  providers: [
    FinancialProfileRepository,
    FinancialProfileService,
    ProtectionRepository,
    ProtectionService,
    DeclaredDebtRepository,
    DebtProfileService
  ],
  exports: [
    FinancialProfileRepository,
    FinancialProfileService,
    ProtectionService,
    DebtProfileService
  ]
})
export class FinancialProfilesModule {}

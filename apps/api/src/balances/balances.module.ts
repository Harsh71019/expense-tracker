import { Module } from "@nestjs/common";

import { BalanceVerifyRepository } from "./balance-verify.repository.js";
import { BalanceVerifyService } from "./balance-verify.service.js";

@Module({
  providers: [BalanceVerifyRepository, BalanceVerifyService]
})
export class BalancesModule {}

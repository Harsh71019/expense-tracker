import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { ReceivablesModule } from "../receivables/receivables.module.js";
import { NetWorthController } from "./net-worth.controller.js";
import { NetWorthService } from "./net-worth.service.js";

@Module({
  imports: [AccountsModule, AssetsModule, ReceivablesModule],
  controllers: [NetWorthController],
  providers: [NetWorthService]
})
export class NetWorthModule {}

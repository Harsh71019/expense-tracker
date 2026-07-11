import { Module } from "@nestjs/common";

import { AccountController } from "./account.controller.js";
import { AccountRepository } from "./account.repository.js";
import { AccountService } from "./account.service.js";

@Module({
  controllers: [AccountController],
  providers: [AccountRepository, AccountService],
  exports: [AccountRepository]
})
export class AccountsModule {}

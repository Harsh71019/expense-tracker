import { Body, Controller, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { AccountIdSchema, CreateAccountSchema, type Account } from "@vyaya/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { AccountService } from "./account.service.js";

@Controller("v1/accounts")
export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<Account> {
    return this.accounts.create(user.id, CreateAccountSchema.parse(body));
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Account[]> {
    return this.accounts.list(user.id);
  }

  @Patch(":accountId/archive")
  @HttpCode(204)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId") accountId: string
  ): Promise<void> {
    return this.accounts.archive(user.id, AccountIdSchema.parse(accountId));
  }
}

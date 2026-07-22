import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Res } from "@nestjs/common";
import { AccountIdSchema, CreateAccountSchema, type Account } from "@vyaya/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequireScopes } from "../auth/require-scopes.decorator.js";
import { AccountService } from "./account.service.js";
import { AccountMutationService } from "./account-mutation.service.js";
import type { Response } from "express";
import { z } from "zod";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/accounts")
export class AccountController {
  constructor(
    private readonly accounts: AccountService,
    private readonly mutations?: AccountMutationService
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<Account> {
    const input = CreateAccountSchema.parse(body);
    if (this.mutations === undefined) return this.accounts.create(user.id, input);
    const result = await this.mutations.create(user.id, input, IdempotencyKeySchema.parse(key));
    if (result.replayed && response !== undefined)
      response.status(200).setHeader("Idempotency-Replayed", "true");
    return result.result;
  }

  @Get()
  @RequireScopes({ accounts: ["read"] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Account[]> {
    return this.accounts.list(user.id);
  }

  @Patch(":accountId/archive")
  @HttpCode(204)
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId") accountId: string,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<void> {
    if (this.mutations !== undefined) {
      const result = await this.mutations.archive(
        user.id,
        AccountIdSchema.parse(accountId),
        IdempotencyKeySchema.parse(key)
      );
      if (result.replayed && response !== undefined)
        response.setHeader("Idempotency-Replayed", "true");
      return undefined;
    }
    return this.accounts.archive(user.id, AccountIdSchema.parse(accountId));
  }
}

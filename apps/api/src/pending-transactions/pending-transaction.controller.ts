import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import {
  ConfirmPendingTransactionSchema,
  CreatePendingTransactionSchema,
  ListPendingTransactionsQuerySchema,
  PendingTransactionIdSchema,
  type PendingTransaction
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequireScopes } from "../auth/require-scopes.decorator.js";
import { PendingTransactionMutationService } from "./pending-transaction-mutation.service.js";
import { PendingTransactionService } from "./pending-transaction.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/pending-transactions")
export class PendingTransactionController {
  constructor(
    private readonly pending: PendingTransactionService,
    private readonly mutations: PendingTransactionMutationService
  ) {}

  @Post()
  @RequireScopes({ transactions: ["write"] })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<PendingTransaction> {
    const result = await this.mutations.create(
      user.id,
      CreatePendingTransactionSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    } else {
      response.setHeader("Location", `/api/v1/pending-transactions/${result.result.id}`);
    }
    return result.result;
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<PendingTransaction[]> {
    const parsed = ListPendingTransactionsQuerySchema.parse(query);
    return this.pending.list(user.id, parsed.status);
  }

  @Post(":id/confirm")
  @HttpCode(200)
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined
  ): Promise<PendingTransaction> {
    return this.pending.confirm(
      user.id,
      PendingTransactionIdSchema.parse(id),
      ConfirmPendingTransactionSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
  }

  @Post(":id/dismiss")
  @HttpCode(204)
  async dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const result = await this.mutations.dismiss(
      user.id,
      PendingTransactionIdSchema.parse(id),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
  }
}

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res
} from "@nestjs/common";
import {
  BatchCategorizeTransactionsSchema,
  CreateTransactionSchema,
  ListTransactionsQuerySchema,
  TransactionIdSchema,
  UpdateTransactionSchema,
  type BatchCategorizeTransactionsResult,
  type Transaction,
  type TransactionInsights,
  type TransactionPage
} from "@treasury-ops/shared";
import type { Request, Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequireScopes } from "../auth/require-scopes.decorator.js";
import { TransactionService } from "./transaction.service.js";
import { TransactionMutationService } from "./transaction-mutation.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/transactions")
export class TransactionController {
  constructor(
    private readonly transactions: TransactionService,
    private readonly mutations: TransactionMutationService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown): Promise<TransactionPage> {
    return this.transactions.list(user.id, ListTransactionsQuerySchema.parse(query));
  }

  @Get("insights")
  insights(@CurrentUser() user: AuthenticatedUser): Promise<TransactionInsights> {
    return this.transactions.getInsights(user.id);
  }

  @Get(":transactionId")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("transactionId") transactionId: string
  ): Promise<Transaction> {
    return this.transactions.get(user.id, TransactionIdSchema.parse(transactionId));
  }

  @Post()
  @RequireScopes({ transactions: ["write"] })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<Transaction> {
    const source = request.authMethod === "api-key" ? "api" : "manual";
    const result = await this.transactions.create(
      user.id,
      CreateTransactionSchema.parse(body),
      IdempotencyKeySchema.parse(idempotencyKey),
      source
    );
    if (result.replayed) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    } else {
      response.setHeader("Location", `/api/v1/transactions/${result.transaction.id}`);
    }
    return result.transaction;
  }

  @Patch(":transactionId")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("transactionId") transactionId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<Transaction> {
    const parsedId = TransactionIdSchema.parse(transactionId);
    const patch = UpdateTransactionSchema.parse(body);
    const result = await this.mutations.update(
      user.id,
      parsedId,
      patch,
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed && response !== undefined) {
      response.setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }

  @Patch()
  async assignCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<BatchCategorizeTransactionsResult> {
    const input = BatchCategorizeTransactionsSchema.parse(body);
    const result = await this.mutations.assignCategory(
      user.id,
      input,
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) {
      response.setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }

  @Post(":transactionId/reverse")
  @HttpCode(200)
  async reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param("transactionId") transactionId: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<Transaction> {
    const result = await this.transactions.reverse(
      user.id,
      TransactionIdSchema.parse(transactionId)
    );
    if (result.replayed && response !== undefined) {
      response.setHeader("Idempotency-Replayed", "true");
    }
    return result.transaction;
  }
}

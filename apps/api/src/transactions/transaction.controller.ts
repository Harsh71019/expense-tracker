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
  Res
} from "@nestjs/common";
import {
  CreateTransactionSchema,
  ListTransactionsQuerySchema,
  TransactionIdSchema,
  UpdateTransactionSchema,
  type Transaction,
  type TransactionPage
} from "@vyaya/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { TransactionService } from "./transaction.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/transactions")
export class TransactionController {
  constructor(private readonly transactions: TransactionService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown): Promise<TransactionPage> {
    return this.transactions.list(user.id, ListTransactionsQuerySchema.parse(query));
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<Transaction> {
    const result = await this.transactions.create(
      user.id,
      CreateTransactionSchema.parse(body),
      idempotencyKey === undefined ? undefined : IdempotencyKeySchema.parse(idempotencyKey)
    );
    if (result.replayed) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    } else {
      response.setHeader("Location", `/api/v1/transactions/${result.transaction.id}`);
    }
    return result.transaction;
  }

  @Patch(":transactionId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("transactionId") transactionId: string,
    @Body() body: unknown
  ): Promise<Transaction> {
    return this.transactions.update(
      user.id,
      TransactionIdSchema.parse(transactionId),
      UpdateTransactionSchema.parse(body)
    );
  }

  @Post(":transactionId/reverse")
  @HttpCode(200)
  async reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param("transactionId") transactionId: string
  ): Promise<Transaction> {
    const result = await this.transactions.reverse(
      user.id,
      TransactionIdSchema.parse(transactionId)
    );
    return result.transaction;
  }
}

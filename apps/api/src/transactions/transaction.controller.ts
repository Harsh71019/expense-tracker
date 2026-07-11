import { Body, Controller, Headers, Post } from "@nestjs/common";
import { CreateTransactionSchema } from "@vyaya/shared";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { TransactionService, type CreateTransactionResult } from "./transaction.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/transactions")
export class TransactionController {
  constructor(private readonly transactions: TransactionService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ): Promise<CreateTransactionResult> {
    return this.transactions.create(
      user.id,
      CreateTransactionSchema.parse(body),
      idempotencyKey === undefined ? undefined : IdempotencyKeySchema.parse(idempotencyKey)
    );
  }
}

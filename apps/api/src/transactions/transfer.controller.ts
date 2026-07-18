import { Body, Controller, Headers, HttpCode, Param, Post, Res } from "@nestjs/common";
import {
  CreateTransferSchema,
  TransferGroupIdSchema,
  type Transfer,
  type TransferReversal
} from "@vyaya/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { TransferService } from "./transfer.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/transfers")
export class TransferController {
  constructor(private readonly transfers: TransferService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<Transfer> {
    const result = await this.transfers.create(
      user.id,
      CreateTransferSchema.parse(body),
      IdempotencyKeySchema.parse(idempotencyKey)
    );
    if (result.replayed) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    } else {
      response.setHeader("Location", `/api/v1/transactions/${result.fromTransaction.id}`);
    }
    return {
      transferGroupId: result.transferGroupId,
      fromTransaction: result.fromTransaction,
      toTransaction: result.toTransaction
    };
  }

  @Post(":transferGroupId/reverse")
  @HttpCode(200)
  async reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param("transferGroupId") transferGroupId: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<TransferReversal> {
    const result = await this.transfers.reverse(
      user.id,
      TransferGroupIdSchema.parse(transferGroupId)
    );
    if (result.replayed && response !== undefined) {
      response.setHeader("Idempotency-Replayed", "true");
    }
    return { transferGroupId: result.transferGroupId, legs: result.legs };
  }
}

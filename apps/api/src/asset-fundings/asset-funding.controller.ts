import { Body, Controller, Headers, Param, Post, Res } from "@nestjs/common";
import {
  AssetFundingIdSchema,
  CreateInvestmentTransactionSchema,
  LinkTransactionToAssetSchema,
  TransactionIdSchema,
  type AssetFundingMutationResult,
  type ReverseAssetFundingResult
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { AssetFundingMutationService } from "./asset-funding-mutation.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1")
export class AssetFundingController {
  constructor(private readonly mutations: AssetFundingMutationService) {}

  @Post("transactions/:transactionId/asset-funding")
  async link(
    @CurrentUser() user: AuthenticatedUser,
    @Param("transactionId") transactionId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<AssetFundingMutationResult> {
    const result = await this.mutations.link(
      user.id,
      TransactionIdSchema.parse(transactionId),
      LinkTransactionToAssetSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.status(200).setHeader("Idempotency-Replayed", "true");
    else response.setHeader("Location", `/api/v1/asset-fundings/${result.result.funding.id}`);
    return result.result;
  }

  @Post("asset-fundings/investments")
  async createInvestment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<AssetFundingMutationResult> {
    const result = await this.mutations.createInvestment(
      user.id,
      CreateInvestmentTransactionSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.status(200).setHeader("Idempotency-Replayed", "true");
    else response.setHeader("Location", `/api/v1/asset-fundings/${result.result.funding.id}`);
    return result.result;
  }

  @Post("asset-fundings/:fundingId/reverse")
  async reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param("fundingId") fundingId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<ReverseAssetFundingResult> {
    const result = await this.mutations.reverse(
      user.id,
      AssetFundingIdSchema.parse(fundingId),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.status(200).setHeader("Idempotency-Replayed", "true");
    return result.result;
  }
}

import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Res } from "@nestjs/common";
import {
  CreateReceivableCorrectionSchema,
  CreateReceivableSchema,
  ListReceivableEventsQuerySchema,
  ListReceivablesQuerySchema,
  ReceivableIdSchema,
  RecordReceivableRepaymentSchema,
  UpdateReceivableMetadataSchema,
  type Receivable,
  type ReceivableEventPage,
  type ReceivableMutationResult,
  type ReceivablePage
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ReceivableMutationService } from "./receivable-mutation.service.js";
import { ReceivableService } from "./receivable.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/receivables")
export class ReceivableController {
  constructor(
    private readonly receivables: ReceivableService,
    private readonly mutations: ReceivableMutationService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown): Promise<ReceivablePage> {
    return this.receivables.list(user.id, ListReceivablesQuerySchema.parse(query));
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<ReceivableMutationResult> {
    const result = await this.mutations.create(
      user.id,
      CreateReceivableSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    } else {
      response.setHeader("Location", `/api/v1/receivables/${result.result.receivable.id}`);
    }
    return result.result;
  }

  @Get(":receivableId")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("receivableId") receivableId: string
  ): Promise<Receivable> {
    return this.receivables.get(user.id, ReceivableIdSchema.parse(receivableId));
  }

  @Patch(":receivableId")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("receivableId") receivableId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<Receivable> {
    const result = await this.mutations.updateMetadata(
      user.id,
      ReceivableIdSchema.parse(receivableId),
      UpdateReceivableMetadataSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
    return result.result;
  }

  @Get(":receivableId/events")
  listEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Param("receivableId") receivableId: string,
    @Query() query: unknown
  ): Promise<ReceivableEventPage> {
    return this.receivables.listEvents(
      user.id,
      ReceivableIdSchema.parse(receivableId),
      ListReceivableEventsQuerySchema.parse(query)
    );
  }

  @Post(":receivableId/repayments")
  async recordRepayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("receivableId") receivableId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<ReceivableMutationResult> {
    const result = await this.mutations.recordRepayment(
      user.id,
      ReceivableIdSchema.parse(receivableId),
      RecordReceivableRepaymentSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
    return result.result;
  }

  @Post(":receivableId/corrections")
  async createCorrection(
    @CurrentUser() user: AuthenticatedUser,
    @Param("receivableId") receivableId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<ReceivableMutationResult> {
    const result = await this.mutations.createCorrection(
      user.id,
      ReceivableIdSchema.parse(receivableId),
      CreateReceivableCorrectionSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
    return result.result;
  }
}

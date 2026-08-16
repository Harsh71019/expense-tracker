import { Body, Controller, Get, Headers, HttpCode, Post, Query, Res } from "@nestjs/common";
import {
  CreateSafetyBufferPreferenceSchema,
  type SafetyBufferPreference,
  type SafetyBufferState,
  type SafetyBufferVersionPage
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SafetyBufferService } from "./safety-buffer.service.js";

const IdempotencyKeySchema = z.string().uuid().optional();
const ListVersionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

@Controller("v1/safety-buffer")
export class SafetyBufferController {
  constructor(private readonly service: SafetyBufferService) {}

  @Get()
  getState(@CurrentUser() user: AuthenticatedUser): Promise<SafetyBufferState> {
    return this.service.getState(user.id);
  }

  @Post()
  @HttpCode(201)
  async createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<SafetyBufferPreference> {
    const validatedKey = key ? IdempotencyKeySchema.parse(key) : undefined;
    const result = await this.service.createVersion(
      user.id,
      CreateSafetyBufferPreferenceSchema.parse(body),
      validatedKey
    );
    if (result.replayed && response !== undefined) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }

  @Get("versions")
  listVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<SafetyBufferVersionPage> {
    const { cursor, limit } = ListVersionsQuerySchema.parse(query);
    return this.service.listVersions(user.id, cursor, limit);
  }
}

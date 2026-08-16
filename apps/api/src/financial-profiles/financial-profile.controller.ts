import { Body, Controller, Get, Headers, HttpCode, Patch, Post, Query, Res } from "@nestjs/common";
import {
  CreateSalaryVersionSchema,
  FinancialProfileUpdateSchema,
  ListSalaryVersionsQuerySchema,
  SalaryStatisticsQuerySchema,
  type FinancialProfile,
  type FinancialProfileState,
  type SalaryStatistics,
  type SalaryVersion,
  type SalaryVersionPage
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { FinancialProfileService } from "./financial-profile.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/financial-profile")
export class FinancialProfileController {
  constructor(private readonly profiles: FinancialProfileService) {}

  @Get()
  getState(@CurrentUser() user: AuthenticatedUser): Promise<FinancialProfileState> {
    return this.profiles.getState(user.id);
  }

  @Patch()
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<FinancialProfile> {
    const result = await this.profiles.updateProfile(
      user.id,
      FinancialProfileUpdateSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed && response !== undefined) {
      response.setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }

  @Get("salary-versions")
  listSalaryVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<SalaryVersionPage> {
    return this.profiles.listSalaryVersions(user.id, ListSalaryVersionsQuerySchema.parse(query));
  }

  @Post("salary-versions")
  @HttpCode(201)
  async createSalaryVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<SalaryVersion> {
    const result = await this.profiles.addSalaryVersion(
      user.id,
      CreateSalaryVersionSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed && response !== undefined) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }

  @Get("salary-statistics")
  getStatistics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<SalaryStatistics> {
    const { asOf } = SalaryStatisticsQuerySchema.parse(query);
    return asOf === undefined
      ? this.profiles.getStatistics(user.id)
      : this.profiles.getStatistics(user.id, asOf);
  }
}

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res
} from "@nestjs/common";
import {
  CreateDeclaredDebtSchema,
  CreateSalaryVersionSchema,
  DeclaredDebtIdSchema,
  FinancialProfileUpdateSchema,
  ListDeclaredDebtsQuerySchema,
  ListSalaryVersionsQuerySchema,
  SalaryStatisticsQuerySchema,
  UpdateDeclaredDebtSchema,
  UpsertProtectionSchema,
  type DeclaredDebt,
  type DeclaredDebtPage,
  type FinancialProfile,
  type FinancialProfileState,
  type ProtectionSnapshot,
  type ProtectionState,
  type SalaryStatistics,
  type SalaryVersion,
  type SalaryVersionPage
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { DebtProfileService } from "./debt-profile.service.js";
import { FinancialProfileService } from "./financial-profile.service.js";
import { ProtectionService } from "./protection.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/financial-profile")
export class FinancialProfileController {
  constructor(
    private readonly profiles: FinancialProfileService,
    private readonly protection: ProtectionService,
    private readonly debts: DebtProfileService
  ) {}

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

  @Get("protection")
  getProtection(@CurrentUser() user: AuthenticatedUser): Promise<ProtectionState> {
    return this.protection.getState(user.id);
  }

  /**
   * Appends an effective-dated protection snapshot. `PUT` reads as "set my
   * protection answers", but it never overwrites history — a new effective date
   * appends, and the same date twice is a conflict.
   */
  @Put("protection")
  @HttpCode(201)
  async putProtection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<ProtectionSnapshot> {
    const result = await this.protection.upsertProtection(
      user.id,
      UpsertProtectionSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed && response !== undefined) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }

  @Get("debts")
  listDebts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<DeclaredDebtPage> {
    return this.debts.list(user.id, ListDeclaredDebtsQuerySchema.parse(query));
  }

  @Post("debts")
  @HttpCode(201)
  async createDebt(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<DeclaredDebt> {
    const result = await this.debts.create(
      user.id,
      CreateDeclaredDebtSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed && response !== undefined) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }

  @Patch("debts/:debtId")
  async updateDebt(
    @CurrentUser() user: AuthenticatedUser,
    @Param("debtId") debtId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<DeclaredDebt> {
    const result = await this.debts.update(
      user.id,
      DeclaredDebtIdSchema.parse(debtId),
      UpdateDeclaredDebtSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed && response !== undefined) {
      response.setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }
}

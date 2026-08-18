import { Controller, Get, Query } from "@nestjs/common";
import { FinancialDiagnosticQuerySchema, type FinancialDiagnostic } from "@treasury-ops/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { FinancialDiagnosticService } from "./financial-diagnostic.service.js";

@Controller("v1/financial-profile/diagnostic")
export class FinancialDiagnosticController {
  constructor(private readonly diagnostic: FinancialDiagnosticService) {}

  @Get()
  getDiagnostic(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<FinancialDiagnostic> {
    const { asOf } = FinancialDiagnosticQuerySchema.parse(query);
    return asOf === undefined
      ? this.diagnostic.getDiagnostic(user.id)
      : this.diagnostic.getDiagnostic(user.id, asOf);
  }
}

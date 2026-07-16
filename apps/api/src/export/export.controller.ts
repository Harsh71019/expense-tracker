import { Controller, Get, Query, Res } from "@nestjs/common";
import { ExportCsvQuerySchema } from "@vyaya/shared";
import type { Response } from "express";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ExportService } from "./export.service.js";

@Controller("v1/export")
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get("csv")
  async csv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
    @Res() response: Response
  ): Promise<void> {
    const csv = await this.exportService.generateCsv(user.id, ExportCsvQuerySchema.parse(query));
    response
      .status(200)
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", 'attachment; filename="vyaya-export.csv"')
      .send(csv);
  }
}

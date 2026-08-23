import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  PortfolioImportBatchIdSchema,
  PortfolioImportRowIdSchema,
  UpdatePortfolioImportRowSchema,
  UploadPortfolioImportMetadataSchema,
  type PortfolioImportBatch,
  type PortfolioImportRow,
  type PortfolioImportRowPage
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { InvalidPdfError } from "../common/errors/portfolio-import.error.js";
import { pdfUploadInterceptor } from "../common/http/pdf-upload.js";
import { PortfolioImportService } from "./portfolio-import.service.js";

const IdempotencyKeySchema = z.string().uuid("Idempotency-Key header must be a UUID.");

const ListRowsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

type UploadedPdfFile = Readonly<{
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}>;

@Controller("v1/portfolio-imports")
export class PortfolioImportController {
  constructor(private readonly imports: PortfolioImportService) {}

  @Post("cas")
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 3_600_000, blockDuration: 3_600_000 } })
  @UseInterceptors(pdfUploadInterceptor)
  async uploadCas(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedPdfFile | undefined,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<PortfolioImportBatch> {
    const idempotencyKey = IdempotencyKeySchema.parse(key);
    if (file === undefined) {
      throw new InvalidPdfError('No PDF file was uploaded under the "file" field.');
    }

    const metadata = UploadPortfolioImportMetadataSchema.parse(body);
    const batch = await this.imports.createBatch(
      user.id,
      file.originalname,
      file.mimetype,
      file.buffer,
      metadata.password,
      metadata.source ?? "kfintech_cams",
      idempotencyKey
    );

    response.setHeader("Location", `/api/v1/portfolio-imports/${batch.id}`);
    return batch;
  }

  @Get()
  @Header("Cache-Control", "no-store")
  list(@CurrentUser() user: AuthenticatedUser): Promise<PortfolioImportBatch[]> {
    return this.imports.listBatches(user.id);
  }

  @Get(":batchId")
  @Header("Cache-Control", "no-store")
  getBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param("batchId") batchId: string
  ): Promise<PortfolioImportBatch> {
    return this.imports.getBatch(user.id, PortfolioImportBatchIdSchema.parse(batchId));
  }

  @Get(":batchId/rows")
  @Header("Cache-Control", "no-store")
  getRows(
    @CurrentUser() user: AuthenticatedUser,
    @Param("batchId") batchId: string,
    @Query() query: unknown
  ): Promise<PortfolioImportRowPage> {
    const parsedBatchId = PortfolioImportBatchIdSchema.parse(batchId);
    const { cursor, limit } = ListRowsQuerySchema.parse(query);
    return this.imports.getRowsPage(user.id, parsedBatchId, cursor, limit);
  }

  @Patch(":batchId/rows/:rowId")
  updateRow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("batchId") batchId: string,
    @Param("rowId") rowId: string,
    @Body() body: unknown
  ): Promise<PortfolioImportRow> {
    const parsedBatchId = PortfolioImportBatchIdSchema.parse(batchId);
    const parsedRowId = PortfolioImportRowIdSchema.parse(rowId);
    const patch = UpdatePortfolioImportRowSchema.parse(body);
    return this.imports.updateRow(user.id, parsedBatchId, parsedRowId, patch);
  }

  @Post(":batchId/commit")
  @HttpCode(200)
  commit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("batchId") batchId: string,
    @Headers("idempotency-key") key: string | undefined
  ): Promise<PortfolioImportBatch> {
    IdempotencyKeySchema.parse(key);
    const parsedBatchId = PortfolioImportBatchIdSchema.parse(batchId);
    return this.imports.commitBatch(user.id, parsedBatchId);
  }

  @Post(":batchId/revert")
  @HttpCode(200)
  revert(
    @CurrentUser() user: AuthenticatedUser,
    @Param("batchId") batchId: string,
    @Headers("idempotency-key") key: string | undefined
  ): Promise<PortfolioImportBatch> {
    IdempotencyKeySchema.parse(key);
    const parsedBatchId = PortfolioImportBatchIdSchema.parse(batchId);
    return this.imports.revertBatch(user.id, parsedBatchId);
  }
}

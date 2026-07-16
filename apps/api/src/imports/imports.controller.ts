import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ImportBatchIdSchema,
  PreviewStagedRowsQuerySchema,
  StagedRowIdSchema,
  UpdateStagedRowSchema,
  UploadImportMetadataSchema,
  type ImportBatch,
  type StagedRow,
  type StagedRowPage
} from "@vyaya/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { InvalidImportFileError } from "../common/errors/invalid-import-file.error.js";
import { ImportsService } from "./imports.service.js";

const MetadataFieldSchema = z.object({
  accountId: z.string(),
  mapping: z.string()
});

/**
 * `@types/multer@2.x` augments a global `Express.Multer.File` namespace that
 * `@types/express@5` no longer declares — an upstream incompatibility, not
 * fixable from application code. Declaring the shape we actually use
 * locally avoids depending on that broken global merge.
 */
type UploadedCsvFile = Readonly<{
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}>;

@Controller("v1/imports")
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedCsvFile | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ): Promise<ImportBatch> {
    if (file === undefined) {
      throw new InvalidImportFileError('No file was uploaded under the "file" field.');
    }

    const { accountId, mapping } = UploadImportMetadataSchema.parse(parseMetadataFields(body));
    const batch = await this.imports.createBatch(
      user.id,
      accountId,
      file.originalname,
      file.mimetype,
      file.buffer,
      mapping
    );
    response.setHeader("Location", `/api/v1/imports/${batch.id}`);
    return batch;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<ImportBatch[]> {
    return this.imports.list(user.id);
  }

  @Get(":importBatchId/preview")
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("importBatchId") importBatchId: string,
    @Query() query: unknown
  ): Promise<StagedRowPage> {
    const { cursor, limit } = PreviewStagedRowsQuerySchema.parse(query);
    return this.imports.preview(user.id, ImportBatchIdSchema.parse(importBatchId), cursor, limit);
  }

  @Patch(":importBatchId/rows/:stagedRowId")
  updateRow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("importBatchId") importBatchId: string,
    @Param("stagedRowId") stagedRowId: string,
    @Body() body: unknown
  ): Promise<StagedRow> {
    return this.imports.updateRow(
      user.id,
      ImportBatchIdSchema.parse(importBatchId),
      StagedRowIdSchema.parse(stagedRowId),
      UpdateStagedRowSchema.parse(body)
    );
  }
}

function parseMetadataFields(body: unknown): unknown {
  const { accountId, mapping } = MetadataFieldSchema.parse(body);
  let parsedMapping: unknown;
  try {
    parsedMapping = JSON.parse(mapping);
  } catch {
    throw new InvalidImportFileError('The "mapping" field must be valid JSON.');
  }
  return { accountId, mapping: parsedMapping };
}

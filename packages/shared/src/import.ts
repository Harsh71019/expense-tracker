import { z } from "zod";

import { AccountIdSchema } from "./account.js";
import { CategoryIdSchema } from "./category.js";
import { TransactionTypeSchema } from "./transaction.js";

/** AGENTS.md §8: "respect the existing caps (5MB, 50k rows, MIME check)." */
export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50_000;
export const ALLOWED_IMPORT_FILE_EXTENSIONS = [".csv"] as const;
export const ALLOWED_IMPORT_MIME_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/csv",
  "text/plain"
] as const;

export const DateFormatSchema = z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]);

export const AmountConventionSchema = z.enum(["single_signed", "debit_credit_cols"]);

export const ImportBatchIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Import batch id must be a MongoDB ObjectId.");

export const StagedRowIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Staged row id must be a MongoDB ObjectId.");

export const ColumnMappingSchema = z
  .object({
    date: z.string().trim().min(1),
    description: z.string().trim().min(1),
    dateFormat: DateFormatSchema,
    amountConvention: AmountConventionSchema,
    amount: z.string().trim().min(1).optional(),
    debit: z.string().trim().min(1).optional(),
    credit: z.string().trim().min(1).optional()
  })
  .refine((value) => value.amountConvention !== "single_signed" || value.amount !== undefined, {
    message: "single_signed mapping requires an amount column.",
    path: ["amount"]
  })
  .refine(
    (value) =>
      value.amountConvention !== "debit_credit_cols" ||
      (value.debit !== undefined && value.credit !== undefined),
    {
      message: "debit_credit_cols mapping requires both debit and credit columns.",
      path: ["debit"]
    }
  );

export const ImportBatchStatusSchema = z.enum([
  "pending",
  "staged",
  "committed",
  "reverted",
  "failed"
]);

export const ImportBatchStatsSchema = z.object({
  total: z.number().int().min(0),
  staged: z.number().int().min(0),
  duplicates: z.number().int().min(0),
  committed: z.number().int().min(0)
});

export const ImportBatchSchema = z.object({
  id: ImportBatchIdSchema,
  userId: z.string().min(1),
  accountId: AccountIdSchema,
  filename: z.string().min(1),
  fileHash: z.string().min(1),
  mapping: ColumnMappingSchema,
  status: ImportBatchStatusSchema,
  stats: ImportBatchStatsSchema,
  committedAt: z.coerce.date().optional(),
  revertedAt: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const ParsedRowSchema = z.object({
  occurredAt: z.coerce.date(),
  amountMinor: z.number().int().positive(),
  type: TransactionTypeSchema,
  description: z.string()
});

export const StagedRowSchema = z.object({
  id: StagedRowIdSchema,
  batchId: ImportBatchIdSchema,
  rowNumber: z.number().int().positive(),
  raw: z.record(z.string(), z.string()),
  parsed: ParsedRowSchema.optional(),
  dedupeHash: z.string().optional(),
  suggestedCategoryId: CategoryIdSchema.optional(),
  problems: z.array(z.string()),
  isDuplicate: z.boolean(),
  include: z.boolean()
});

export const UploadImportMetadataSchema = z.object({
  accountId: AccountIdSchema,
  mapping: ColumnMappingSchema
});

export type DateFormat = z.infer<typeof DateFormatSchema>;
export type AmountConvention = z.infer<typeof AmountConventionSchema>;
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;
export type ImportBatchId = z.infer<typeof ImportBatchIdSchema>;
export type StagedRowId = z.infer<typeof StagedRowIdSchema>;
export type ImportBatchStatus = z.infer<typeof ImportBatchStatusSchema>;
export type ImportBatchStats = z.infer<typeof ImportBatchStatsSchema>;
export type ImportBatch = z.infer<typeof ImportBatchSchema>;
export type ParsedRow = z.infer<typeof ParsedRowSchema>;
export type StagedRow = z.infer<typeof StagedRowSchema>;
export type UploadImportMetadata = z.infer<typeof UploadImportMetadataSchema>;
